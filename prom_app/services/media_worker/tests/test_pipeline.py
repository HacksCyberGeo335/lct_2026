import base64
from dataclasses import replace
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import cv2
import httpx
import numpy as np
from PIL import Image

from media_worker.clients import Inference, validate_observation
from media_worker.config import Config
from media_worker.media import detections, frames, letterbox
from media_worker.worker import process


def config(kind='yolo'):
    return Config(kind, 'unused', 'http://unused', 'unused', 'unused', 'results',
                  'http://inference' if kind == 'yolo' else 'http://inference/v1',
                  'detector' if kind == 'yolo' else 'Qwen/Qwen3-VL-2B-Instruct')


class PipelineTest(unittest.TestCase):
    def test_yolo_geometry_and_no_extra_nms(self):
        rgb = np.zeros((384, 768, 3), dtype=np.uint8)
        rgb[:, :, 0] = 255
        tensor, geometry = letterbox(rgb, 768)
        self.assertEqual(tensor.shape, (1, 3, 768, 768))
        self.assertEqual(tensor.dtype, np.float32)
        self.assertEqual(tensor[0, 0, 200, 0], 1)
        output = np.array([[[20, 202, 100, 292, .9, 0], [20, 202, 100, 292, .8, 1],
                            [20, 202, 100, 292, .7, 0], [0, 0, 0, 0, .1, 0]]])
        values = detections(output, geometry, 768, 384, config().class_names, .25)
        self.assertEqual(len(values), 3)  # end-to-end predictions are not suppressed again
        self.assertEqual(values[0]['bbox_xyxy'], [20., 10., 100., 100.])
        self.assertEqual(values[1]['class_name'], 'Самосвал')
        with self.assertRaises(ValueError):
            detections(np.zeros((1, 14, 100)), geometry, 768, 384, config().class_names, .25)
        output[0, 0, 5] = 80
        with self.assertRaises(ValueError):
            detections(output, geometry, 768, 384, config().class_names, .25)

    def test_photo_orientation_and_video_sampling(self):
        with TemporaryDirectory() as temp:
            path = Path(temp)/'photo.jpg'
            image = Image.new('RGB', (20, 10))
            exif = image.getexif(); exif[274] = 6
            image.save(path, exif=exif)
            result = list(frames(path, 'photo', 1, 10))
            self.assertEqual(result[0].rgb.shape, (20, 10, 3))
            video = str(Path(temp)/'video.avi')
            writer = cv2.VideoWriter(video, cv2.VideoWriter_fourcc(*'MJPG'), 10, (32, 32))
            self.assertTrue(writer.isOpened())
            for _ in range(25): writer.write(np.zeros((32,32,3), dtype=np.uint8))
            writer.release()
            result = list(frames(video, 'video', 1, 10))
            self.assertEqual([f.index for f in result], [0,10,20])
            self.assertEqual([f.timestamp_ms for f in result], [0,1000,2000])
            with self.assertRaises(ValueError): list(frames(video, 'video', 1, 2))
            path.write_bytes(b'not a photo')
            with self.assertRaises(Exception): list(frames(path, 'photo', 1, 10))

    def test_triton_http_binary_contract(self):
        cfg = config()
        seen = []
        def handler(request):
            seen.append(request.url.path)
            if request.url.path.endswith('/ready'): return httpx.Response(200)
            if request.method == 'GET':
                return httpx.Response(200, json={
                    'inputs': [{'name':'images','datatype':'FP32','shape':[-1,3,-1,-1]}],
                    'outputs':[{'name':'output0','datatype':'FP32','shape':[1,300,6]}]})
            n = int(request.headers['Inference-Header-Content-Length'])
            metadata = json.loads(request.content[:n])
            self.assertEqual(metadata['inputs'][0]['shape'], [1,3,768,768])
            self.assertEqual(len(request.content[n:]), 1*3*768*768*4)
            return httpx.Response(200,json={'outputs':[{'name':'output0','datatype':'FP32',
                'shape':[1,1,6], 'data':[20,202,100,292,.9,0]}]})
        client = Inference(cfg); client.http.close()
        client.http = httpx.Client(transport=httpx.MockTransport(handler))
        client.ready()
        result = client.infer(np.zeros((384,768,3),dtype=np.uint8))
        self.assertEqual(result['detections'][0]['bbox_xyxy'], [20.,10.,100.,100.])
        self.assertTrue(seen[-1].endswith('/versions/1/infer'))
        client.close()

    def test_vlm_data_url_and_strict_response(self):
        observation = {'summary_ru':'Техника на площадке', 'objects':[], 'limitations':['Один кадр']}
        def handler(request):
            if request.method == 'GET': return httpx.Response(200,json={'data':[{'id':config('vlm').model}]})
            body = json.loads(request.content)
            self.assertEqual(body['model'],'Qwen/Qwen3-VL-2B-Instruct')
            data = body['messages'][0]['content'][1]['image_url']['url'].split(',')[1]
            self.assertEqual(Image.open(BytesIO(base64.b64decode(data))).size,(1280,640))
            self.assertEqual(body['response_format']['type'],'json_schema')
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(observation)}}]})
        client = Inference(config('vlm')); client.http.close()
        client.http = httpx.Client(transport=httpx.MockTransport(handler))
        client.ready()
        self.assertEqual(client.infer(np.zeros((1000,2000,3),dtype=np.uint8))['observation'],observation)
        client.close()
        with self.assertRaises(ValueError): validate_observation({'summary_ru':'broken'})
        with self.assertRaises(ValueError):
            validate_observation({**observation, 'objects':[{'name':'a','count':True,'confidence':'high'}]})

    def test_manifest_is_published_after_all_frames(self):
        saved = {}
        class MemoryStorage:
            def download(self, job, path):
                Image.new('RGB',(32,16)).save(path,format='PNG')
                return 'source-hash'
            def put_json(self,bucket,key,value):
                saved[key] = value
                return {'bucket':bucket,'key':key,'sha256':'hash'}
        class StubInference:
            def ready(self): pass
            def infer(self,rgb): return {'detections':[]}
        job = {'id':1,'media_uuid':'media','media_type':'photo','storage_key':'originals/photo.png',
               'original_etag':'etag','lease_token':'token'}
        result = process(config(),job,MemoryStorage(),StubInference(),lambda:None)
        self.assertEqual(result['frame_count'],1)
        manifest = saved[result['key']]
        self.assertEqual(manifest['frames'][0]['frame_index'],0)
        self.assertEqual(manifest['source_sha256'],'source-hash')
        self.assertIn('/token/',result['key'])
        self.assertFalse(manifest['preprocessing']['nms'])


if __name__ == '__main__': unittest.main()
