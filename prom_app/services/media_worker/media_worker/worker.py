import json
import logging
from pathlib import Path
import signal
from tempfile import TemporaryDirectory
import threading

from .clients import Inference
from .config import Config
from .jobs import Jobs, LeaseLost
from .media import frames
from .storage import Storage

log = logging.getLogger('media_worker')


class Lease:
    def __init__(self, jobs, job):
        self.jobs, self.job = jobs, job
        self.stop = threading.Event()
        self.lost = threading.Event()
        self.thread = threading.Thread(target=self.renew, daemon=True)

    def renew(self):
        while not self.stop.wait(self.jobs.lease_seconds / 3):
            try:
                if not self.jobs.heartbeat(self.job):
                    self.lost.set()
                    return
            except Exception:
                self.lost.set()
                return

    def check(self):
        if self.lost.is_set():
            raise LeaseLost('Unable to retain job lease')

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.stop.set()
        self.thread.join(timeout=20)


def process(cfg, job, storage, inference, check):
    # Attempt-specific keys prevent an expired worker overwriting the winning result.
    prefix = f"{job['media_uuid']}/{cfg.kind}/{job['id']}/{job['lease_token']}"
    inference.ready()
    with TemporaryDirectory(prefix='media-worker-') as directory:
        source = Path(directory) / 'source'
        source_sha256 = storage.download(job, source)
        results = []
        for frame in frames(source, job['media_type'], cfg.frame_interval, cfg.max_frames):
            check()
            height, width = frame.rgb.shape[:2]
            result = {'frame_index': frame.index, 'timestamp_ms': frame.timestamp_ms,
                      'width': width, 'height': height, **inference.infer(frame.rgb)}
            check()
            result_ref = storage.put_json(cfg.result_bucket, f'{prefix}/frames/{frame.index:08d}.json', result)
            results.append({'frame_index': frame.index, 'timestamp_ms': frame.timestamp_ms, 'result': result_ref})
        manifest = {
            'schema_version': 1, 'media_uuid': str(job['media_uuid']), 'media_type': job['media_type'],
            'kind': cfg.kind, 'model': cfg.model,
            'model_version': cfg.model_version if cfg.kind == 'yolo' else None,
            'source_storage_key': job['storage_key'], 'source_etag': job['original_etag'],
            'source_sha256': source_sha256,
            'sampling': {'interval_seconds': cfg.frame_interval, 'max_frames': cfg.max_frames,
                         'photo_exif_orientation': 'applied', 'video_timestamps': 'decoder_pts_or_index_over_fps'},
            'preprocessing': {'image_size': cfg.image_size, 'confidence': cfg.confidence,
                              'class_names': list(cfg.class_names), 'end2end': True, 'nms': False}
                             if cfg.kind == 'yolo' else {'max_edge': cfg.vlm_max_edge, 'prompt_version': 1},
            'frame_count': len(results), 'frames': results,
        }
        check()
        ref = storage.put_json(cfg.result_bucket, f'{prefix}/manifest.json', manifest)
        return {**ref, 'frame_count': len(results), 'source_sha256': source_sha256}


def main():
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    cfg = Config.from_env()
    jobs, storage, inference = Jobs(cfg.database_url, cfg.lease_seconds), Storage(cfg), Inference(cfg)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    try:
        while not stop.is_set():
            job = None
            try:
                job = jobs.claim(cfg.kind)
                if not job:
                    stop.wait(cfg.poll_seconds)
                    continue
                with Lease(jobs, job) as lease:
                    result = process(cfg, job, storage, inference, lease.check)
                    lease.check()
                    jobs.finish(job, result)
                log.info(json.dumps({'event': 'job.succeeded', 'kind': cfg.kind, 'job_id': job['id'],
                                     'media_uuid': str(job['media_uuid']), 'frames': result['frame_count']}))
            except Exception as error:
                # Do not log URLs, auth headers or model-returned bodies.
                message = type(error).__name__
                if isinstance(error, (ValueError, LeaseLost)):
                    message += ': ' + str(error)
                if job:
                    try:
                        jobs.fail(job, message)
                    except Exception:
                        log.error(json.dumps({'event': 'job.fail_update_failed', 'job_id': job['id']}))
                log.error(json.dumps({'event': 'job.error', 'kind': cfg.kind,
                                      'job_id': job['id'] if job else None, 'error': message}))
                stop.wait(cfg.poll_seconds)
    finally:
        inference.close()


if __name__ == '__main__':
    main()
