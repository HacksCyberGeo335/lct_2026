import math
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps


@dataclass
class Frame:
    index: int
    timestamp_ms: int
    rgb: np.ndarray


def frames(path, media_type, interval, max_frames):
    if media_type == 'photo':
        with Image.open(path) as image:
            if image.format not in ('JPEG', 'PNG'):
                raise ValueError('Photo content is not JPEG/PNG')
            # Boxes refer to the displayed (EXIF-oriented) image.
            yield Frame(0, 0, np.asarray(ImageOps.exif_transpose(image).convert('RGB')))
        return
    if media_type != 'video':
        raise ValueError('Unsupported media_type')
    capture = cv2.VideoCapture(str(path))
    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        if not capture.isOpened() or not math.isfinite(fps) or fps <= 0:
            raise ValueError('Cannot decode video or determine FPS')
        index, count, next_ms = 0, 0, 0.0
        last_ms = -1.0
        while True:
            ok, bgr = capture.read()
            if not ok:
                break
            timestamp = capture.get(cv2.CAP_PROP_POS_MSEC)
            if not math.isfinite(timestamp) or timestamp <= last_ms:
                timestamp = index * 1000 / fps
            last_ms = timestamp
            if timestamp + 0.01 >= next_ms:
                if count >= max_frames:
                    raise ValueError('MAX_FRAMES exceeded; increase interval or limit (no silent truncation)')
                yield Frame(index, round(timestamp), cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
                count += 1
                next_ms += interval * 1000
            index += 1
        if count == 0:
            raise ValueError('Video contains no decodable frames')
        # Some decoders return EOF on corruption; catch an early end when frame count is known.
        expected = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        if math.isfinite(expected) and expected > index + 1:
            raise ValueError('Video decoding stopped before declared end')
    finally:
        capture.release()


def letterbox(rgb, size):
    height, width = rgb.shape[:2]
    ratio = min(size / width, size / height)
    resized_width, resized_height = round(width * ratio), round(height * ratio)
    left, top = (size - resized_width) // 2, (size - resized_height) // 2
    canvas = np.full((size, size, 3), 114, dtype=np.uint8)
    canvas[top:top + resized_height, left:left + resized_width] = cv2.resize(rgb, (resized_width, resized_height))
    tensor = np.ascontiguousarray(canvas.transpose(2, 0, 1)[None], dtype='<f4') / 255
    return tensor, (ratio, left, top)


def detections(output, geometry, width, height, names, threshold):
    # YOLO26m end2end=True: xyxy in letterboxed pixels, score, class ID. No NMS.
    if output.ndim != 3 or output.shape[0] != 1 or output.shape[2] != 6:
        raise ValueError(f'Expected YOLO end-to-end [1,N,6], received {output.shape}')
    if not np.isfinite(output).all():
        raise ValueError('Non-finite YOLO output')
    ratio, left, top = geometry
    results = []
    for x1, y1, x2, y2, score, cls in output[0]:
        if not 0 <= score <= 1:
            raise ValueError('YOLO confidence outside [0,1]')
        if score < threshold:
            continue
        class_id = int(cls)
        if cls != class_id or not 0 <= class_id < len(names):
            raise ValueError('YOLO class ID does not match configured names')
        box = [float(np.clip((x1-left)/ratio, 0, width)), float(np.clip((y1-top)/ratio, 0, height)),
               float(np.clip((x2-left)/ratio, 0, width)), float(np.clip((y2-top)/ratio, 0, height))]
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        results.append({'class_id': class_id, 'class_name': names[class_id],
                        'confidence': float(score), 'bbox_xyxy': box})
    return results
