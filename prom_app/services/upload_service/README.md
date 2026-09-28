# Upload Service

`upload_service` реализует backend-часть загрузки фото/видео и постановку задач обработки.

Сервис создаёт запись загрузки, возвращает frontend URL для прямого PUT в MinIO, а после подтверждения проверяет объект и атомарно обновляет PostgreSQL и создаёт задачи воркеров.

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

В той же транзакции создаются задачи `yolo` и `vlm` в `processing_jobs`. Повторный `upload-complete` не создаёт дубликатов и не сбрасывает существующие задачи. `READY` означает завершённую загрузку; состояние обработки хранится отдельно. После обеих успешных веток воркеры создают `analysis_tasks`. См. [контракт обработки](../../../docs/INFERENCE.md).

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

## Загрузка фотографий

Поддерживаются один или несколько файлов JPG (`.jpg`, `.jpeg`) и PNG, включая расширения в верхнем регистре. На фронтенде выберите «Фотографии JPG / PNG» и выделите файлы в диалоге выбора.

Каждый файл проходит отдельный цикл:

1. `POST /api/photos/init-upload` с JSON `{"file_name":"photo.jpg","size":12345}`.
2. Прямой `PUT` в MinIO по `<upload_url>/<uuid>/<имя файла из storage_key>` (сегменты URL кодируются). Заголовок `Content-Type`: `image/jpeg` или `image/png`.
3. `POST /api/photos/{uuid}/upload-complete`.

Ответ и статусы совпадают с видео API. Для каждого фото создаётся свой UUID. Фронтенд загружает фотографии последовательно и продолжает работу при ошибке отдельного файла. Повтор пропускает успешные файлы, использует ранее полученный UUID и повторяет только подтверждение, если PUT уже завершился.

Фото сохраняются в существующем бакете `MINIO_ORIGINALS_BUCKET` и таблице `general_video_table`, поле `media_type` равно `photo`; для видео — `video`. Сервис автоматически добавляет столбец при старте, существующие записи получают `video`. Начальная SQL-схема также обновлена. Потребители этой таблицы, обрабатывающие только видео, должны фильтровать `media_type = 'video'`.

Backend проверяет расширение при инициализации, а при подтверждении — наличие объекта, ненулевой размер и соответствующий расширению Content-Type через HEAD. Это проверка метаданных, без декодирования содержимого изображения. Подтверждение фото через маршрут видео (и наоборот) возвращает 404.

Для применения изменений пересоберите и перезапустите frontend, api_gateway и upload_service:

```bash
docker compose up -d --build frontend api_gateway upload_service
```
