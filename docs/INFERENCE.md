# Воркеры обработки фото и видео

## Компоненты

Два Python-процесса используют пакет `prom_app/services/media_worker`: `WORKER_KIND=yolo` и `WORKER_KIND=vlm`. Клиенты находятся в `clients.py`, обработка кадров — в `media.py`, очередь — в `jobs.py`. В проекте добавлены только воркеры: vLLM/Triton вызываются по внешним HTTP endpoint.

Каждый загруженный файл — самостоятельный `media_uuid`. Несколько фотографий создают несколько независимых пар задач. Общий альбом или сессия камеры автоматически не создаются; время загрузки и порядок выбора фото не считаются временем съёмки.

## Очередь и состояния

1. После PUT в MinIO frontend вызывает `/api/photos/{uuid}/upload-complete` или `/api/videos/{uuid}/upload-complete`.
2. Upload Service проверяет объект через HEAD. В одной транзакции выставляет `READY`, сохраняет размер/MIME/ETag и создаёт две строки `processing_jobs`: `yolo` и `vlm`. Ошибка вставки задач откатывает обновление файла.
3. `UNIQUE(media_uuid, kind)` защищает от дублей при повторе подтверждения. Существующие задачи и их попытки не сбрасываются.
4. Воркер захватывает свою задачу через `FOR UPDATE SKIP LOCKED`, назначает `lease_token`, увеличивает `attempts`. Одна реплика обрабатывает один файл за раз.
5. Heartbeat продлевает lease каждые `JOB_LEASE_SECONDS / 3`. После падения процесса другая реплика забирает задачу с истёкшим lease. Старый token не может завершить её или изменить статус.
6. Ошибка возвращает задачу в `QUEUED` с задержками 5 и 10 секунд; по умолчанию три попытки. После исчерпания — `FAILED`, в том числе при падении на последней попытке. Недоступность inference тоже расходует попытки: включайте воркеры после готовности серверов.
7. Результаты записываются в S3 под отдельным префиксом попытки. Manifest публикуется после обработки всех выбранных кадров, затем задача становится `SUCCEEDED`.
8. После обеих успешных веток, если SHA-256 исходного содержимого совпадает, в одной транзакции с последним завершением создаётся единственная запись `analysis_tasks`. Завершения сериализованы блокировкой по UUID.

Статус исходника остаётся `READY`: он описывает загрузку. Статусы inference хранятся отдельно. Redis не используется. Исполнение inference может повториться после сбоя; общей транзакции между S3 и PostgreSQL нет. Незавершённые попытки могут оставить артефакты в S3. Следующий этап читает ссылки из `analysis_tasks`, а не выбирает последний файл в бакете.

Схему для существующих volumes создаёт обновлённый Upload Service при старте; для новых — `infra/postgres/initdb/002_processing_jobs.sql`. Старые `READY` автоматически не обрабатываются: повторите `upload-complete` для нужного UUID. Для повторного запуска `FAILED` используйте адресную операцию ниже.

## Подготовка исходников

Оба воркера скачивают оригинал через S3 API с credentials и `If-Match` по ETag подтверждённой загрузки. Проверяются размер и `MAX_DOWNLOAD_BYTES`, рассчитывается SHA-256. Оригиналы после подтверждения должны оставаться неизменными.

Фото декодируются как JPEG/PNG, поворачиваются по EXIF и приводятся к RGB. Из видео извлекается первый кадр и далее кадры с интервалом `FRAME_INTERVAL_SECONDS` (по умолчанию 1 секунда). Сохраняются индекс и относительное время от начала видео: timestamp декодера, с fallback `index / FPS`. У фото индекс и timestamp равны нулю. Аудио не передаётся.

Лимиты по умолчанию — 300 выбранных кадров и 2 GiB исходного файла. Превышение `MAX_FRAMES` даёт ошибку без успешного неполного manifest. Для длинного видео увеличьте интервал или лимит. Клипы, temporal inference и трекинг не реализованы: обе модели вызываются для каждого выбранного кадра отдельно.

Одинаковые параметры выборки задаются обоим сервисам. Manifest содержит фактическую конфигурацию и список кадров; следующий этап сопоставляет их по `frame_index` и проверяет совместимость выборки. Не меняйте параметры реплик в середине обработки.

## Контракт YOLO26m / Triton

Настройки соответствуют предоставленному экспорту: YOLO26m, opset 17, `task=detect`, `batch=1`, `imgsz=[768,768]`, `channels=3`, `dynamic=True`, `end2end=True`, `nms=False`. «ONNX v8» в метаданных — версия формата ONNX, а не архитектура YOLOv8.

| Поле | Контракт |
| --- | --- |
| Endpoint | `/v2/models/{model}/versions/{version}/infer` |
| Модель / версия | `TRITON_MODEL_NAME=detector`, `TRITON_MODEL_VERSION=1`; уточнить при развёртывании |
| Вход / выход | `images` / `output0`; сверить с фактическим экспортом |
| Входной тензор | FP32 `[1,3,768,768]`, RGB, NCHW, значения `[0,1]` |
| Подготовка | Letterbox с сохранением пропорций, padding 114, полный canvas 768×768 |
| HTTP-тело | JSON-заголовок + бинарный little-endian тензор Triton |
| Выход | FP32 `[1,N,6]`: `x1,y1,x2,y2,confidence,class_id` |
| Постобработка | Порог confidence, снятие padding и масштаба, clipping к размеру исходного кадра |
| NMS | Повторно не выполняется для end-to-end экспорта |

Перед каждым файлом проверяются readiness конкретной версии и metadata тензоров. Динамические оси `-1` допустимы. Несовместимые формы, типы и class ID вызывают ошибку. Сам ONNX ещё не предоставлен: ожидание `[1,N,6]` основано на метаданных пользователя и контракте Ultralytics end-to-end, его нужно подтвердить реальным endpoint.

| ID | Класс |
| --- | --- |
| 0 | Экскаватор |
| 1 | Самосвал |
| 2 | Грузовой автомобиль |
| 3 | Кран |
| 4 | Фронтальный погрузчик |
| 5 | Автобетоносмеситель |
| 6 | Бульдозер |
| 7 | Прицеп |
| 8 | Каток |
| 9 | Автобетононасос |

Пример результата кадра:

```json
{
  "frame_index": 30, "timestamp_ms": 1000, "width": 1920, "height": 1080,
  "detections": [
    {"class_id": 0, "class_name": "Экскаватор", "confidence": 0.91, "bbox_xyxy": [120, 180, 740, 850]}
  ]
}
```

Координаты относятся к исходному декодированному кадру; для фото — после EXIF-поворота. Идентификаторов трекинга нет.

## Контракт Qwen / vLLM

Вызов: `{VLLM_BASE_URL}/chat/completions`, база включает `/v1`. Модель по умолчанию — `Qwen/Qwen3-VL-2B-Instruct`. Её ID должен присутствовать в `/v1/models`; если сервер использует alias, задайте его в `VLLM_MODEL`.

Каждый выбранный кадр отправляется отдельным запросом: инструкция и `image_url` вида `data:image/jpeg;base64,...`. Максимальная сторона — 1280 px, пропорции сохраняются, JPEG quality 90. Серверу vLLM не нужны S3 URL и credentials.

Задаются `temperature=0`, `max_tokens=1024`, `response_format=json_schema`. Сервер должен поддерживать multimodal chat completions со структурированным ответом. Локальная проверка отклоняет неверный JSON, несоответствие схеме и обрезанный ответ (`finish_reason` не `stop`).

```json
{
  "frame_index": 30, "timestamp_ms": 1000, "width": 1920, "height": 1080,
  "observation": {
    "summary_ru": "На площадке видна строительная техника.",
    "objects": [{"name": "Экскаватор", "count": 1, "confidence": "high"}],
    "limitations": ["Часть площадки вне поля зрения"]
  },
  "response_id": "chatcmpl-example",
  "usage": {"prompt_tokens": 500, "completion_tokens": 100, "total_tokens": 600}
}
```

Qwen описывает видимые факты, приблизительный счёт и ограничения. Он не выводит план, нарушение или риск задержки по одному кадру. Названия объектов свободные; сопоставление со справочником относится к следующему этапу. Его качественная уверенность `low/medium/high` не равна численному score YOLO.

## Артефакты и передача следующему этапу

Обе ветки пишут JSON в `MINIO_DETECTIONS_BUCKET`:

```text
<media_uuid>/<yolo|vlm>/<job_id>/<lease_token>/frames/<frame_index>.json
<media_uuid>/<yolo|vlm>/<job_id>/<lease_token>/manifest.json
```

Manifest содержит `schema_version`, UUID/тип файла, storage key/ETag/SHA-256 оригинала, модель (и версию Triton), параметры выборки/подготовки, число кадров и ссылки `bucket/key/sha256` на их результаты. Кадры как отдельные картинки не сохраняются; `MINIO_DERIVED_BUCKET` остаётся для будущих производных артефактов.

Поле `payload` новой записи `analysis_tasks(status='QUEUED')`:

```json
{
  "schema_version": 1,
  "event": "media.inference.completed",
  "media_uuid": "021472d8-a659-47de-893d-bedc24d015e7",
  "media_type": "video",
  "source_storage_key": "video-originals-prom/021472d8-a659-47de-893d-bedc24d015e7/example.mp4",
  "source_etag": "etag-from-storage",
  "results": {
    "yolo": {"bucket": "video-detections-prod", "key": "uuid/yolo/job/token/manifest.json", "sha256": "manifest-hash", "frame_count": 10, "source_sha256": "source-hash"},
    "vlm": {"bucket": "video-detections-prod", "key": "uuid/vlm/job/token/manifest.json", "sha256": "manifest-hash", "frame_count": 10, "source_sha256": "source-hash"}
  }
}
```

Следующий потребитель должен захватить запись с подтверждением обработки, прочитать оба manifest и результаты кадров, проверить хеши/версию схемы и объединить детекции с наблюдениями. Для анализа правил/графика отдельно нужны подтверждённые `site_id`, `camera_id`, время съёмки, активная работа/фаза и правила. Сейчас upload API их не принимает. Отсутствие детекции не доказывает отсутствие техники на всём объекте.

Реализована граница передачи — таблица и payload. Потребитель анализа нарушений, уведомления и API чтения результатов пока не реализованы. Если одна ветка `FAILED`, передача не создаётся; результат успешной ветки сохраняется.

## Настройка и восстановление

Параметры: [media_worker/.env.example](../prom_app/services/media_worker/.env.example). Для серверов на хосте Docker Desktop используется `host.docker.internal`, для удалённых — доступный DNS/IP. `localhost` внутри контейнера обозначает сам контейнер. Примерные порты: Triton HTTP 8000, vLLM 8001; уточните реальные адреса. HTTP Triton нельзя заменять его gRPC портом.

S3 credentials: `WORKER_S3_ACCESS_KEY`/`WORKER_S3_SECRET_KEY`, с fallback на существующие MinIO credentials в локальном Compose. Права: чтение originals и запись/чтение результатов. `TRITON_API_KEY`/`VLLM_API_KEY` при наличии передаются как Bearer.

```bash
docker compose -f docker-compose.yml -f docker-compose.workers.yml up -d --build yolo_worker vlm_worker
docker compose -f docker-compose.yml -f docker-compose.workers.yml logs -f yolo_worker vlm_worker
docker compose -f docker-compose.yml -f docker-compose.workers.yml up -d --scale yolo_worker=2 --scale vlm_worker=2
docker compose exec postgres psql -U prom_app -d prom_app -c "SELECT id, media_uuid, kind, status, attempts, last_error FROM processing_jobs ORDER BY id;"
docker compose exec postgres psql -U prom_app -d prom_app -c "SELECT id, media_uuid, status, payload FROM analysis_tasks ORDER BY id;"
```

После исправления причины ошибки повторите конкретную неуспешную задачу (подставьте её ID):

```sql
UPDATE processing_jobs
SET status='QUEUED', attempts=0, available_at=NOW(),
    lease_token=NULL, lease_until=NULL, last_error=NULL, updated_at=NOW()
WHERE id=123 AND status='FAILED';
```

Пересчёт успешных задач другой моделью потребует версии pipeline, которая пока не реализована. Повтор `upload-complete` не сбрасывает `FAILED`.

## Проверка контрактов

Команды тестирования — в [README воркеров](../prom_app/services/media_worker/README.md). Тесты используют настоящий PostgreSQL/MinIO и контролируемые HTTP-ответы моделей. Качество реального inference и фактический ONNX пока не проверены: endpoint ещё нет.

Официальные источники, использованные для реализации клиентов:

- [vLLM: multimodal inputs](https://docs.vllm.ai/en/latest/features/multimodal_inputs/)
- [Triton: binary tensor HTTP extension](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/protocol/extension_binary_data.html)
- [Ultralytics YOLO26: end-to-end inference](https://docs.ultralytics.com/models/yolo26/)
