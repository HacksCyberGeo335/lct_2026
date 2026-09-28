# Services

Каталог `prom_app/services` содержит backend-сервисы приложения.

## Текущие сервисы

```text
services/
├── api_gateway/
├── upload_service/
└── media_worker/       # yolo_worker и vlm_worker
```

`session_service` и `websocket_service` сейчас не являются рабочими сервисами в compose и не документируются как runtime-компоненты.

## api_gateway

Внешняя HTTP-точка входа для frontend.

Задачи:

- отдаёт `GET /health`;
- добавляет CORS headers;
- пишет JSON access logs;
- проксирует `/api/videos/*` и `/api/photos/*` во внутренний `upload_service`.

Порт:

```text
http://localhost:${API_GATEWAY_HOST_PORT:-8080}
```

Внутри compose:

```text
http://api_gateway:8080
```

## upload_service

Сервис upload flow.

Задачи:

- принимает `POST /api/videos/init-upload`;
- создаёт запись видео в PostgreSQL со статусом `UPLOADING`;
- возвращает `uuid`, `upload_url`, `storage_key`;
- принимает `POST /api/videos/{uuid}/upload-complete`;
- проверяет объект в MinIO через `HEAD`;
- поддерживает аналогичные маршруты `/api/photos/...`;
- атомарно обновляет файл до `READY` и создаёт задачи `yolo` и `vlm`.

Порт:

```text
http://localhost:${UPLOAD_SERVICE_HOST_PORT:-8081}
```

Внутри compose:

```text
http://upload_service:8081
```

## yolo_worker и vlm_worker

Два Python-процесса из общего [media_worker](media_worker/README.md). Получают задачи PostgreSQL, скачивают оригинал из MinIO, декодируют фото или выборку кадров видео. `yolo_worker` отправляет FP32 RGB `[1,3,768,768]` во внешний Triton/YOLO26m; `vlm_worker` отправляет JPEG кадра и инструкцию во внешний vLLM/Qwen3-VL-2B-Instruct.

YOLO возвращает детекции с координатами и классами, Qwen — структурированные наблюдения. Воркеры сохраняют JSON и manifest в MinIO, отмечают `SUCCEEDED`; после обеих веток создают `analysis_tasks` со ссылками для следующего этапа. Есть lease/heartbeat, повторы и защита от устаревших результатов. [Полный контракт](../../docs/INFERENCE.md).

Запуск после настройки endpoint:

```bash
docker compose -f docker-compose.yml -f docker-compose.workers.yml up -d --build yolo_worker vlm_worker
```

## Runtime dependencies

```text
frontend
  -> api_gateway
  -> upload_service
  -> postgres
  -> s3-storage
```

`upload_service` зависит от:

- `postgres`;
- `s3_init`, который должен создать MinIO bucket'ы.

## Docker

Оба текущих backend-сервиса имеют multi-stage Go Dockerfile:

- `prom_app/services/api_gateway/Dockerfile`
- `prom_app/services/upload_service/Dockerfile`

Сборка:

```bash
docker compose build api_gateway upload_service
```

Запуск:

```bash
docker compose up -d api_gateway upload_service
```

Обычно их запускают через весь stack:

```bash
docker compose up --build
```

## Health checks

```bash
curl http://localhost:8080/health
curl http://localhost:8081/health
```

Ожидаемый ответ:

```json
{"status":"ok"}
```

## Логи

`api_gateway` и `upload_service` пишут JSON access logs в stdout. Эти логи собираются Alloy и доступны в Grafana/Loki.
