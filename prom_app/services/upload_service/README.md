# Upload Service

`upload_service` реализует backend-часть загрузки видео.

Сервис не принимает видеофайл через себя. Он создаёт запись загрузки, возвращает frontend URL для прямого PUT в MinIO, а после подтверждения проверяет объект в MinIO и обновляет PostgreSQL.

## Runtime

Локальный URL:

```text
http://localhost:${UPLOAD_SERVICE_HOST_PORT:-8081}
```

Внутри compose:

```text
http://upload_service:8081
```

Docker image:

```text
${UPLOAD_SERVICE_IMAGE:-prom_app_upload_service:local}
```

## Environment

```text
UPLOAD_SERVICE_ADDRESS=:8081
DATABASE_URL=postgres://prom_app:prom_app_password@postgres:5432/prom_app?sslmode=disable
MINIO_INTERNAL_ENDPOINT=http://s3-storage:9000
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
MINIO_ORIGINALS_BUCKET=video-originals-prom
```

`MINIO_INTERNAL_ENDPOINT` используется самим сервисом для `HEAD`-проверки объекта.

`MINIO_PUBLIC_ENDPOINT` используется в ответе `init-upload`, чтобы browser мог загрузить файл напрямую в MinIO.

## Endpoints

### GET /health

Проверка живости сервиса.

Ответ:

```json
{"status":"ok"}
```

### POST /api/videos/init-upload

Создаёт запись видео в PostgreSQL со статусом `UPLOADING`.

Request:

```json
{
  "file_name": "example.mp4",
  "size": 12345678
}
```

Validation:

- `file_name` обязателен;
- `size` должен быть больше `0`.

Response:

```json
{
  "uuid": "021472d8-a659-47de-893d-bedc24d015e7",
  "upload_url": "http://localhost:9000/video-originals-prom",
  "storage_key": "video-originals-prom/021472d8-a659-47de-893d-bedc24d015e7/example.mp4"
}
```

`uuid` генерируется backend-сервисом.

`storage_key` строится как:

```text
<bucket>/<uuid>/<path.Base(file_name)>
```

### POST /api/videos/{uuid}/upload-complete

Подтверждает, что browser завершил PUT в MinIO.

Flow:

1. Загружает видео из PostgreSQL по `uuid`.
2. Делает `HEAD` в MinIO по `storage_key`.
3. Если объект найден, обновляет запись:
   - `status = READY`;
   - `original_size_bytes`;
   - `original_content_type`;
   - `original_etag`.

Успешный ответ:

```text
HTTP 200
```

## Ошибки

- `400` - invalid JSON body, пустой `file_name`, некорректный `size`;
- `404` - видео или объект в MinIO не найден;
- `405` - unsupported HTTP method;
- `502` - ошибка проверки объекта в MinIO;
- `500` - ошибка БД или внутренняя ошибка.

## Зависимости

- PostgreSQL service: `postgres`;
- MinIO service: `s3-storage`;
- MinIO init service: `s3_init`.

В compose `upload_service` стартует после healthy PostgreSQL и успешного завершения `s3_init`.

## Структура

```text
upload_service/
├── Dockerfile
├── README.md
├── go.mod
├── go.sum
├── cmd/
│   └── upload_service/
│       └── main.go
└── internal/
    ├── config/
    │   └── config.go
    ├── handler/
    │   └── video.go
    ├── middleware/
    │   └── middleware.go
    ├── repository/
    │   └── repository.go
    ├── server/
    │   └── server.go
    └── storage/
        └── http.go
```

## Docker

Сборка:

```bash
docker compose build upload_service
```

Запуск:

```bash
docker compose up -d upload_service
```

Проверка:

```bash
curl http://localhost:8081/health
```

Обычно сервис вызывается через API Gateway:

```bash
curl http://localhost:8080/health
```
