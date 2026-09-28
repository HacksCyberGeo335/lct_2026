import hashlib
import json

import boto3
from botocore.config import Config


class Storage:
    def __init__(self, cfg):
        self.limit = cfg.max_download_bytes
        self.client = boto3.client('s3', endpoint_url=cfg.s3_endpoint,
            aws_access_key_id=cfg.s3_access_key, aws_secret_access_key=cfg.s3_secret_key,
            region_name='us-east-1', config=Config(connect_timeout=10, read_timeout=60,
                retries={'max_attempts': 2}, s3={'addressing_style': 'path'}))

    def download(self, job, destination):
        bucket, key = job['storage_key'].split('/', 1)
        kwargs = {'Bucket': bucket, 'Key': key}
        if job['original_etag']:
            kwargs['IfMatch'] = '"' + job['original_etag'] + '"'
        response = self.client.get_object(**kwargs)
        body = response['Body']
        try:
            if response['ContentLength'] > self.limit:
                raise ValueError('Source exceeds MAX_DOWNLOAD_BYTES')
            digest, size = hashlib.sha256(), 0
            with open(destination, 'wb') as target:
                for chunk in body.iter_chunks(chunk_size=1024 * 1024):
                    size += len(chunk)
                    if size > self.limit:
                        raise ValueError('Source exceeds MAX_DOWNLOAD_BYTES')
                    digest.update(chunk)
                    target.write(chunk)
            if size != job['original_size_bytes'] or size != response['ContentLength']:
                raise ValueError('Source size differs from confirmed upload')
            return digest.hexdigest()
        finally:
            body.close()

    def put_json(self, bucket, key, value):
        body = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
        self.client.put_object(Bucket=bucket, Key=key, Body=body, ContentType='application/json')
        return {'bucket': bucket, 'key': key, 'sha256': hashlib.sha256(body).hexdigest()}
