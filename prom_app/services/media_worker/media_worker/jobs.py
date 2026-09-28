"""PostgreSQL queue with leases and fenced completion, no Redis Pub/Sub."""
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


class LeaseLost(RuntimeError):
    pass


class Jobs:
    def __init__(self, database_url, lease_seconds):
        self.database_url = database_url
        self.lease_seconds = lease_seconds

    def connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row, connect_timeout=10,
                               options="-c statement_timeout=15000 -c lock_timeout=10000")

    def claim(self, kind):
        token = uuid4()
        with self.connect() as db:
            # Last-attempt crashes must become terminal, not remain RUNNING forever.
            db.execute("""
                UPDATE processing_jobs SET status='FAILED', lease_token=NULL, lease_until=NULL,
                    last_error='Lease expired after final attempt', updated_at=NOW()
                WHERE kind=%s AND status='RUNNING' AND lease_until < NOW() AND attempts >= max_attempts
            """, (kind,))
            row = db.execute("""
                WITH candidate AS (
                    SELECT id FROM processing_jobs WHERE kind=%s AND attempts < max_attempts
                    AND ((status='QUEUED' AND available_at <= NOW())
                         OR (status='RUNNING' AND lease_until < NOW()))
                    ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1
                )
                UPDATE processing_jobs j SET status='RUNNING', attempts=attempts+1,
                    lease_token=%s, lease_until=NOW() + %s * INTERVAL '1 second', updated_at=NOW()
                FROM candidate WHERE j.id=candidate.id RETURNING j.*
            """, (kind, token, self.lease_seconds)).fetchone()
            if not row:
                return None
            media = db.execute("""
                SELECT media_type, storage_key, original_etag, original_size_bytes
                FROM general_video_table WHERE uuid=%s
            """, (row['media_uuid'],)).fetchone()
            return {**row, **media}

    def heartbeat(self, job):
        with self.connect() as db:
            return db.execute("""
                UPDATE processing_jobs SET lease_until=NOW() + %s * INTERVAL '1 second', updated_at=NOW()
                WHERE id=%s AND lease_token=%s AND status='RUNNING' AND lease_until > NOW()
            """, (self.lease_seconds, job['id'], job['lease_token'])).rowcount == 1

    def fail(self, job, error):
        with self.connect() as db:
            db.execute("""
                UPDATE processing_jobs SET status=CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'QUEUED' END,
                    available_at=NOW() + %s * INTERVAL '1 second', last_error=%s,
                    lease_token=NULL, lease_until=NULL, updated_at=NOW()
                WHERE id=%s AND lease_token=%s AND status='RUNNING' AND lease_until > NOW()
            """, (min(300, 5 * 2 ** (job['attempts'] - 1)), error[:2000], job['id'], job['lease_token']))

    def finish(self, job, result):
        with self.connect() as db:
            # Serialize the two completions so exactly one durable next-stage task appears.
            db.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (str(job['media_uuid']),))
            updated = db.execute("""
                UPDATE processing_jobs SET status='SUCCEEDED', result=%s, last_error=NULL,
                    lease_token=NULL, lease_until=NULL, updated_at=NOW()
                WHERE id=%s AND lease_token=%s AND status='RUNNING' AND lease_until > NOW()
            """, (Jsonb(result), job['id'], job['lease_token'])).rowcount
            if updated != 1:
                raise LeaseLost('Job lease expired or was reassigned')
            rows = db.execute("""
                SELECT kind, result FROM processing_jobs WHERE media_uuid=%s AND status='SUCCEEDED'
            """, (job['media_uuid'],)).fetchall()
            results = {row['kind']: row['result'] for row in rows}
            if set(results) == {'yolo', 'vlm'}:
                if results['yolo']['source_sha256'] != results['vlm']['source_sha256']:
                    raise ValueError('Inference results refer to different source contents')
                payload = {
                    'schema_version': 1, 'event': 'media.inference.completed',
                    'media_uuid': str(job['media_uuid']), 'media_type': job['media_type'],
                    'source_storage_key': job['storage_key'], 'source_etag': job['original_etag'],
                    'results': results,
                }
                db.execute("""
                    INSERT INTO analysis_tasks (media_uuid, payload) VALUES (%s, %s)
                    ON CONFLICT (media_uuid) DO NOTHING
                """, (job['media_uuid'], Jsonb(payload)))
