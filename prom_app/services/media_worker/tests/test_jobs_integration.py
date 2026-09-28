"""Opt-in real PostgreSQL tests; each test uses and drops its own isolated schema."""
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import unittest
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from media_worker.jobs import Jobs, LeaseLost


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'Set TEST_DATABASE_URL for PostgreSQL integration')
class JobsTest(unittest.TestCase):
    def setUp(self):
        self.url = os.environ['TEST_DATABASE_URL']
        self.schema = 'test_worker_' + uuid4().hex
        with psycopg.connect(self.url, autocommit=True) as db:
            db.execute(f'CREATE SCHEMA {self.schema}')
        schema = self.schema
        class IsolatedJobs(Jobs):
            def connect(self):
                return psycopg.connect(self.database_url,row_factory=dict_row,
                    options=f'-c search_path={schema} -c statement_timeout=15000')
        self.jobs = IsolatedJobs(self.url, 30)
        self.media_uuid = uuid4()
        with self.jobs.connect() as db:
            db.execute('''CREATE TABLE general_video_table (
                uuid UUID PRIMARY KEY, media_type TEXT, storage_key TEXT,
                original_etag TEXT, original_size_bytes BIGINT)''')
            db.execute(Path(os.environ['PROCESSING_SCHEMA_FILE']).read_text())
            db.execute("INSERT INTO general_video_table VALUES (%s,'photo','originals/x.png','etag',10)",(self.media_uuid,))
            db.execute("INSERT INTO processing_jobs(media_uuid,kind) VALUES (%s,'yolo'),(%s,'vlm')",(self.media_uuid,self.media_uuid))

    def tearDown(self):
        with psycopg.connect(self.url, autocommit=True) as db:
            db.execute(f'DROP SCHEMA {self.schema} CASCADE')

    def test_exclusive_claim_and_concurrent_handoff(self):
        with ThreadPoolExecutor(2) as pool:
            claimed = list(pool.map(lambda _: self.jobs.claim('yolo'), range(2)))
        self.assertEqual(sum(job is not None for job in claimed), 1)
        yolo = next(job for job in claimed if job)
        vlm = self.jobs.claim('vlm')
        with ThreadPoolExecutor(2) as pool:
            list(pool.map(lambda job:self.jobs.finish(job,{'key':job['kind'], 'source_sha256':'same'}), [yolo,vlm]))
        with self.jobs.connect() as db:
            tasks = db.execute('SELECT * FROM analysis_tasks').fetchall()
        self.assertEqual(len(tasks),1)
        self.assertEqual(set(tasks[0]['payload']['results']),{'yolo','vlm'})
        with self.assertRaises(LeaseLost): self.jobs.finish(yolo,{'key':'stale'})

    def test_reclaim_fences_old_worker_and_retry_limit(self):
        old = self.jobs.claim('yolo')
        self.assertTrue(self.jobs.heartbeat(old))
        with self.jobs.connect() as db:
            db.execute("UPDATE processing_jobs SET lease_until=NOW()-INTERVAL '1 second' WHERE id=%s",(old['id'],))
        new = self.jobs.claim('yolo')
        self.assertNotEqual(old['lease_token'],new['lease_token'])
        self.assertFalse(self.jobs.heartbeat(old))
        with self.assertRaises(LeaseLost): self.jobs.finish(old,{'key':'stale'})
        self.jobs.fail(old,'stale error')
        self.jobs.fail(new,'retry error')
        self.assertIsNone(self.jobs.claim('yolo'))  # backoff
        with self.jobs.connect() as db:
            db.execute("UPDATE processing_jobs SET available_at=NOW() WHERE id=%s",(new['id'],))
        last = self.jobs.claim('yolo'); self.assertEqual(last['attempts'],3)
        with self.jobs.connect() as db:
            db.execute("UPDATE processing_jobs SET lease_until=NOW()-INTERVAL '1 second' WHERE id=%s",(last['id'],))
        self.assertIsNone(self.jobs.claim('yolo'))
        with self.jobs.connect() as db:
            status = db.execute('SELECT status FROM processing_jobs WHERE id=%s',(last['id'],)).fetchone()['status']
            self.assertEqual(db.execute('SELECT count(*) AS n FROM analysis_tasks').fetchone()['n'],0)
        self.assertEqual(status,'FAILED')

    def test_different_sources_do_not_create_handoff(self):
        yolo = self.jobs.claim('yolo')
        vlm = self.jobs.claim('vlm')
        self.jobs.finish(yolo, {'source_sha256': 'first'})
        with self.assertRaises(ValueError):
            self.jobs.finish(vlm, {'source_sha256': 'changed'})
        with self.jobs.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) AS n FROM analysis_tasks').fetchone()['n'], 0)
            self.assertEqual(db.execute("SELECT status FROM processing_jobs WHERE kind='vlm'").fetchone()['status'], 'RUNNING')


if __name__ == '__main__': unittest.main()
