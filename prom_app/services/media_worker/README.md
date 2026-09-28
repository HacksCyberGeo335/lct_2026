# Media workers

Общий Python-пакет для сервисов `yolo_worker` и `vlm_worker`. Поток, контракты моделей, примеры JSON и передача на следующий этап: [docs/INFERENCE.md](../../../docs/INFERENCE.md).

## Запуск

После настройки внешних серверов перенесите параметры из [.env.example](.env.example) в корневой `.env`. Из корня репозитория:

```bash
docker compose -f docker-compose.yml -f docker-compose.workers.yml up -d --build yolo_worker vlm_worker
```

Без Docker установите `requirements.txt`, задайте также `WORKER_KIND`, `DATABASE_URL`, `MINIO_INTERNAL_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `MINIO_DETECTIONS_BUCKET` и выполните из этого каталога `python -m media_worker`.

Схему БД создаёт обновлённый upload service. Клиенты inference синхронные и переиспользуются между задачами; параллелизм достигается отдельными процессами/репликами. Heartbeat работает в отдельном потоке. GPU воркеру не требуется.

| Файл | Назначение |
| --- | --- |
| `config.py` | Окружение, лимиты и классы YOLO26m |
| `jobs.py` | Захват, lease, heartbeat, повторы и `analysis_tasks` |
| `storage.py` | S3, проверка ETag/размера, SHA-256, запись JSON |
| `media.py` | Фото/видео, EXIF, выборка кадров, letterbox, координаты |
| `clients.py` | Клиенты внешних Triton HTTP и vLLM chat completions |
| `worker.py` | Цикл обработки, manifest и логи |

## Тесты

Из корня репозитория, без inference-серверов:

```bash
docker build -t prom_app_media_worker:local prom_app/services/media_worker
docker run --rm prom_app_media_worker:local python -m unittest discover -s tests -v
```

Тесты очереди с настоящим PostgreSQL создают и затем удаляют отдельную схему для каждого теста:

```bash
docker compose -f docker-compose.yml -f docker-compose.workers.yml run --rm --no-deps \
  -v ./prom_app/services/upload_service/internal/repository/processing.sql:/app/processing.sql:ro \
  -e PROCESSING_SCHEMA_FILE=/app/processing.sql \
  --entrypoint sh yolo_worker \
  -c 'TEST_DATABASE_URL="$DATABASE_URL" python -m unittest discover -s tests -v'
```

`tests/test_flow_integration.py` проверяет весь путь с настоящими Upload Service, PostgreSQL и MinIO. Ответы внешних моделей заменены тестовыми HTTP-ответами. Для включения добавьте к команде `-e RUN_FLOW_TEST=1 -e TEST_UPLOAD_URL=http://upload_service:8081`. Полный тест создаёт собственные загрузки и удаляет их строки/объекты после проверки; его следует запускать на тестовом стенде с остановленными обычными воркерами.
