# API Gateway

`api_gateway` - внешняя HTTP-точка входа для frontend и публичного API приложения.

## Назначение

Сервис:

- принимает HTTP-запросы с frontend;
- отдаёт health endpoint;
- добавляет CORS headers;
- пишет JSON access logs;
- проксирует video API во внутренний `upload_service`.

## Runtime

Локальный URL:

```text
http://localhost:${API_GATEWAY_HOST_PORT:-8080}
```

Внутри compose:

```text
http://api_gateway:8080
```

Docker image:

```text
${API_GATEWAY_IMAGE:-prom_app_api_gateway:local}
```

## Environment

```text
API_GATEWAY_ADDRESS=:8080
UPLOAD_SERVICE_URL=http://upload_service:8081
```

`UPLOAD_SERVICE_URL` - target reverse proxy для `/api/videos/*`.

## Endpoints

### GET /health

Проверка живости gateway.

Ответ:

```json
{"status":"ok"}
```

### /api/videos/*

Все запросы с prefix `/api/videos/` проксируются в `upload_service`.

Текущий upload contract:

```text
POST /api/videos/init-upload
POST /api/videos/{uuid}/upload-complete
```

## CORS

Gateway выставляет:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, HEAD, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

`OPTIONS` завершается ответом `204`.

## Логи

Access logs пишутся в stdout в JSON-формате с полями:

- `log_type`;
- `level`;
- `service`;
- `method`;
- `endpoint`;
- `path`;
- `status`;
- `duration_seconds`;
- `duration_ms`;
- `remote_addr`;
- `user_agent`;
- `error` для HTTP 4xx/5xx.

Endpoint `/api/videos/{uuid}/upload-complete` нормализуется в логах, чтобы UUID не раздували cardinality.

## Структура

```text
api_gateway/
├── APIGateWay.md
├── Dockerfile
├── go.mod
├── cmd/
│   └── api_gateway/
│       └── main.go
└── internal/
    ├── config/
    │   └── config.go
    ├── handler/
    │   └── health.go
    ├── middleware/
    │   └── middleware.go
    ├── router/
    │   └── router.go
    └── server/
        └── server.go
```

## Docker

Сборка:

```bash
docker compose build api_gateway
```

Запуск:

```bash
docker compose up -d api_gateway
```

Проверка:

```bash
curl http://localhost:8080/health
```
