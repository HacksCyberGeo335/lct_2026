"""Opt-in API/S3/DB flow; inference HTTP responses are controlled fixtures."""
from dataclasses import replace
from io import BytesIO
import hashlib
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

import cv2
import httpx
import numpy as np
from PIL import Image

from media_worker.clients import Inference
from media_worker.config import Config
from media_worker.jobs import Jobs
from media_worker.storage import Storage
from media_worker.worker import process


@unittest.skipUnless(os.getenv('RUN_FLOW_TEST') == '1', 'Set RUN_FLOW_TEST=1 on a test stack')
class FlowTest(unittest.TestCase):
    def test_photo_and_video_handoff(self):
        cfg = Config.from_env()
        storage = Storage(cfg)
        jobs = Jobs(cfg.database_url, cfg.lease_seconds)
        upload_url = os.environ['TEST_UPLOAD_URL'].rstrip('/')
        photo = BytesIO()
        Image.new('RGB', (96, 48), 'orange').save(photo, format='PNG')
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'clip.avi'
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'MJPG'), 10, (96, 48))
            self.assertTrue(writer.isOpened())
            for _ in range(15):
                writer.write(np.zeros((48, 96, 3), dtype=np.uint8))
            writer.release()
            fixtures = [('photos', 'тест 100%.png', 'image/png', photo.getvalue(), 1),
                        ('videos', 'test.avi', 'video/x-msvideo', path.read_bytes(), 2)]

        observation = {'summary_ru': 'Тестовый ответ', 'objects': [], 'limitations': ['Тест']}

        def response(request):
            if request.url.path.endswith('/ready'):
                return httpx.Response(200)
            if request.url.path.endswith('/models'):
                return httpx.Response(200, json={'data': [{'id': 'Qwen/Qwen3-VL-2B-Instruct'}]})
            if request.method == 'GET':
                return httpx.Response(200, json={
                    'inputs': [{'name': 'images', 'datatype': 'FP32', 'shape': [1, 3, 768, 768]}],
                    'outputs': [{'name': 'output0', 'datatype': 'FP32', 'shape': [1, 300, 6]}]})
            if request.url.path.endswith('/infer'):
                return httpx.Response(200, json={'outputs': [{'name': 'output0', 'datatype': 'FP32',
                    'shape': [1, 1, 6], 'data': [80, 240, 400, 400, .9, 0]}]})
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop',
                'message': {'content': json.dumps(observation)}}]})

        def read_json(ref):
            result = storage.client.get_object(Bucket=ref['bucket'], Key=ref['key'])
            try:
                body = result['Body'].read()
            finally:
                result['Body'].close()
            self.assertEqual(hashlib.sha256(body).hexdigest(), ref['sha256'])
            return json.loads(body)

        with httpx.Client(timeout=30) as api:
            for route, filename, mime, content, frame_count in fixtures:
                with self.subTest(route=route):
                    initialized = api.post(upload_url + f'/api/{route}/init-upload',
                                           json={'file_name': filename, 'size': len(content)})
                    initialized.raise_for_status()
                    media = initialized.json()
                    bucket, key = media['storage_key'].split('/', 1)
                    try:
                        storage.client.put_object(Bucket=bucket, Key=key, Body=content, ContentType=mime)
                        for _ in range(2):
                            api.post(upload_url + f'/api/{route}/{media["uuid"]}/upload-complete').raise_for_status()
                        with jobs.connect() as db:
                            rows = db.execute('SELECT * FROM processing_jobs WHERE media_uuid=%s',
                                              (media['uuid'],)).fetchall()
                            self.assertEqual(len(rows), 2)
                            self.assertTrue(all(row['status'] == 'QUEUED' and row['attempts'] == 0 for row in rows))

                        for kind in ('yolo', 'vlm'):
                            # Claim only test-created jobs; queue concurrency is tested separately.
                            with jobs.connect() as db:
                                job = db.execute("""
                                    UPDATE processing_jobs SET status='RUNNING', attempts=attempts+1,
                                        lease_token=%s, lease_until=NOW()+INTERVAL '3 minutes'
                                    WHERE media_uuid=%s AND kind=%s AND status='QUEUED' RETURNING *
                                """, (uuid4(), media['uuid'], kind)).fetchone()
                                source = db.execute('SELECT media_type, storage_key, original_etag, original_size_bytes FROM general_video_table WHERE uuid=%s',
                                                    (media['uuid'],)).fetchone()
                            self.assertIsNotNone(job)
                            job.update(source)
                            client_cfg = replace(cfg, kind=kind, frame_interval=1, max_frames=10,
                                endpoint='http://fixture' if kind == 'yolo' else 'http://fixture/v1',
                                model='detector' if kind == 'yolo' else 'Qwen/Qwen3-VL-2B-Instruct')
                            inference = Inference(client_cfg)
                            inference.http.close()
                            inference.http = httpx.Client(transport=httpx.MockTransport(response))
                            try:
                                result = process(client_cfg, job, storage, inference, lambda: None)
                            finally:
                                inference.close()
                            jobs.finish(job, result)
                            manifest = read_json(result)
                            self.assertEqual(manifest['frame_count'], frame_count)
                            self.assertEqual(manifest['source_sha256'], hashlib.sha256(content).hexdigest())
                            for frame in manifest['frames']:
                                record = read_json(frame['result'])
                                self.assertIn('detections' if kind == 'yolo' else 'observation', record)
                            with jobs.connect() as db:
                                tasks = db.execute('SELECT payload FROM analysis_tasks WHERE media_uuid=%s',
                                                   (media['uuid'],)).fetchall()
                            self.assertEqual(len(tasks), 0 if kind == 'yolo' else 1)
                        self.assertEqual(set(tasks[0]['payload']['results']), {'yolo', 'vlm'})
                        api.post(upload_url + f'/api/{route}/{media["uuid"]}/upload-complete').raise_for_status()
                        with jobs.connect() as db:
                            rows = db.execute('SELECT status, attempts FROM processing_jobs WHERE media_uuid=%s',
                                              (media['uuid'],)).fetchall()
                        self.assertTrue(all(row['status'] == 'SUCCEEDED' and row['attempts'] == 1 for row in rows))
                    finally:
                        # Only objects under this freshly created UUID belong to this test.
                        for target in {bucket, cfg.result_bucket}:
                            paginator = storage.client.get_paginator('list_objects_v2')
                            for page in paginator.paginate(Bucket=target, Prefix=media['uuid'] + '/'):
                                for obj in page.get('Contents', []):
                                    storage.client.delete_object(Bucket=target, Key=obj['Key'])
                        with jobs.connect() as db:
                            db.execute('DELETE FROM general_video_table WHERE uuid=%s', (media['uuid'],))


if __name__ == '__main__':
    unittest.main()
