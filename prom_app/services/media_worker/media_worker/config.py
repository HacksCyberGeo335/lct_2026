import math
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    kind: str
    database_url: str
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    result_bucket: str
    endpoint: str
    model: str
    model_version: str = "1"
    api_key: str = ""
    input_name: str = "images"
    output_name: str = "output0"
    class_names: tuple[str, ...] = ("Экскаватор", "Самосвал", "Грузовой автомобиль", "Кран", "Фронтальный погрузчик", "Автобетоносмеситель", "Бульдозер", "Прицеп", "Каток", "Автобетононасос")
    image_size: int = 768
    confidence: float = 0.25
    frame_interval: float = 1.0
    max_frames: int = 300
    max_download_bytes: int = 2 * 1024**3
    vlm_max_edge: int = 1280
    max_tokens: int = 1024
    timeout: float = 120
    lease_seconds: int = 180
    poll_seconds: float = 2

    @classmethod
    def from_env(cls):
        kind = os.environ["WORKER_KIND"]
        if kind not in ("yolo", "vlm"):
            raise ValueError("WORKER_KIND must be yolo or vlm")
        c = cls(
            kind=kind, database_url=os.environ["DATABASE_URL"],
            s3_endpoint=os.environ["MINIO_INTERNAL_ENDPOINT"],
            s3_access_key=os.environ["S3_ACCESS_KEY"], s3_secret_key=os.environ["S3_SECRET_KEY"],
            result_bucket=os.environ["MINIO_DETECTIONS_BUCKET"],
            endpoint=os.environ["TRITON_HTTP_URL" if kind == "yolo" else "VLLM_BASE_URL"].rstrip("/"),
            model=os.getenv("TRITON_MODEL_NAME", "detector") if kind == "yolo" else os.getenv("VLLM_MODEL", "Qwen/Qwen3-VL-2B-Instruct"),
            model_version=os.getenv("TRITON_MODEL_VERSION", "1"),
            api_key=os.getenv("INFERENCE_API_KEY", ""),
            input_name=os.getenv("TRITON_INPUT_NAME", "images"),
            output_name=os.getenv("TRITON_OUTPUT_NAME", "output0"),
            class_names=tuple(x.strip() for x in os.getenv("YOLO_CLASS_NAMES", ",".join(cls.class_names)).split(",") if x.strip()),
            image_size=int(os.getenv("YOLO_IMAGE_SIZE", "768")),
            confidence=float(os.getenv("YOLO_CONFIDENCE", "0.25")),
            frame_interval=float(os.getenv("FRAME_INTERVAL_SECONDS", "1")),
            max_frames=int(os.getenv("MAX_FRAMES", "300")),
            max_download_bytes=int(os.getenv("MAX_DOWNLOAD_BYTES", str(2 * 1024**3))),
            vlm_max_edge=int(os.getenv("VLM_MAX_EDGE", "1280")),
            max_tokens=int(os.getenv("VLM_MAX_TOKENS", "1024")),
            timeout=float(os.getenv("INFERENCE_TIMEOUT_SECONDS", "120")),
            lease_seconds=int(os.getenv("JOB_LEASE_SECONDS", "180")),
            poll_seconds=float(os.getenv("POLL_SECONDS", "2")),
        )
        limits = (c.frame_interval, c.max_frames, c.image_size, c.max_download_bytes,
                  c.vlm_max_edge, c.max_tokens, c.timeout, c.poll_seconds)
        if not all(math.isfinite(value) and value > 0 for value in limits) or c.lease_seconds < 6:
            raise ValueError("Worker limits must be positive; JOB_LEASE_SECONDS >= 6")
        if not (0 <= c.confidence <= 1) or not c.class_names:
            raise ValueError("Invalid YOLO thresholds")
        return c
