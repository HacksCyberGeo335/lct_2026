# Services

Каталог `prom_app/services` содержит backend-сервисы приложения.

## Текущие сервисы

```text
services/
├── api_gateway/
└── upload_service/
```

`session_service` и `websocket_service` сейчас не являются рабочими сервисами в compose и не документируются как runtime-компоненты.

## api_gateway

Внешняя HTTP-точка входа для frontend.

Задачи:

- отдаёт `GET /health`;
- добавляет CORS headers;
- пишет JSON access logs;
- проксирует `/api/videos/*` во внутренний `upload_service`.

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
- обновляет запись видео до статуса `READY`.

Порт:

```text
http://localhost:${UPLOAD_SERVICE_HOST_PORT:-8081}
```

Внутри compose:

```text
http://upload_service:8081
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
