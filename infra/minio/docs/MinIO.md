# MinIO

MinIO используется как локальное S3-compatible object storage для:
* видео, 
* результатов обработки, 
* детекций, 
* моделей,
* временных файлов

## Доступы

Web-консоль:

- URL: [http://localhost:9001](http://localhost:9001)
- Login: `prom_app`
- Password: `prom_app_password`

S3 API:

- Для сервисов внутри `docker-compose`: `http://s3-storage:9000`
- Для локальной машины: [http://localhost:9000](http://localhost:9000)

Переменные, которые позже можно передавать сервисам:

```text
S3_ENDPOINT=http://s3-storage:9000
S3_ACCESS_KEY=prom_app
S3_SECRET_KEY=prom_app_password
S3_REGION=us-east-1
```

## Тестовые бакеты

Сейчас `s3_init` автоматически создает три тестовых бакета:

- `video-originals-prom` - исходные видео.
- `video-derived-prod` - производные файлы: HLS, превью, анализ, метаданные.
- `video-detections-prod` - результаты ML-детекций.

## Логика хранения

Общий принцип: один `video_id` является корневым ключом для всех данных, связанных с конкретным видео. Это позволяет быстро найти оригинал, производные файлы, результаты анализа и детекции.

```text
Object Storage
├── Originals     - исходные видео
├── Derived       - обработанные видео и артефакты
├── Detections    - результаты ML-пайплайнов
├── Exports       - пользовательские экспорты
├── Temp          - временные файлы
├── ML Models     - модели для inference
└── Backups       - бэкапы платформы
```

## Целевая схема бакетов

### 1. video-originals-prod

Хранит оригинальные загруженные видео.

```text
video-originals-prod/
└── <video_id>/
    └── source/
        └── original.mp4
```

### 2. video-derived-prod

Хранит все производные файлы, полученные после обработки видео.

```text
video-derived-prod/
└── <video_id>/
    ├── playback/
    │   └── v1/
    │       └── hls/
    │           ├── master.m3u8
    │           ├── 1080p/
    │           ├── 720p/
    │           └── 480p/
    ├── analysis/
    │   └── v1/
    │       └── analysis.mp4
    ├── thumbnails/
    │   └── v1/
    ├── storyboard/
    │   └── v1/
    └── metadata/
        └── v1/
```

### 3. video-detections-prod

Хранит результаты работы ML-пайплайнов по каждому видео.

```text
video-detections-prod/
└── <video_id>/
    └── <pipeline_id>/
        ├── manifest.json
        ├── chunks/
        │   ├── 000000_010000.parquet
        │   ├── 010000_020000.parquet
        │   └── ...
        ├── aggregates/
        │   ├── per_second.parquet
        │   └── summary.json
        └── debug/
```

### 4. video-exports-prod

Хранит готовые пользовательские экспорты.

```text
video-exports-prod/
└── <user_id>/
    └── <export_id>/
        ├── output.mp4
        └── manifest.json
```

### 5. video-temp-prod

Хранит временные файлы разных процессов.

```text
video-temp-prod/
├── uploads/
├── media-processing/
├── detections/
├── exports/
└── failed/
```

### 6. ml-models-prod

Хранит ML-модели и версии моделей.

```text
ml-models-prod/
└── triton/
    ├── birds_pipeline/
    │   ├── config.pbtxt
    │   └── 1/
    │       └── model.py
    └── bird_yolo/
        ├── config.pbtxt
        ├── 1/
        │   └── model.onnx
        └── 2/
            └── model.onnx
```

### 7. platform-backups-prod

Хранит бэкапы инфраструктурных данных.

```text
platform-backups-prod/
├── postgres/
└── configuration/
```
