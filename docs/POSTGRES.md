# PostgreSQL

PostgreSQL хранит состояние загруженных видео и метаданные оригинального файла.

## Сервис

Compose service:

```text
postgres
```

Образ собирается из:

```text
infra/postgres/Dockerfile
```

Dockerfile:

```dockerfile
FROM postgres:16-alpine

COPY initdb/ /docker-entrypoint-initdb.d/
```

## URL и доступы

С локальной машины:

```text
Host:     localhost
Port:     ${POSTGRES_HOST_PORT:-5432}
Database: ${POSTGRES_DB:-prom_app}
User:     ${POSTGRES_USER:-prom_app}
Password: ${POSTGRES_PASSWORD:-prom_app_password}
```

Изнутри compose:

```text
postgres://prom_app:prom_app_password@postgres:5432/prom_app?sslmode=disable
```

В приложении это задаётся через:

```text
DATABASE_URL
```

## Init schema

Первичная схема лежит в:

```text
infra/postgres/initdb/001_video_tables.sql
```

PostgreSQL entrypoint выполняет файлы из `docker-entrypoint-initdb.d` только при первом создании volume `postgres_data`. Если volume уже существует, изменения initdb-файлов автоматически не применяются.

## Таблицы

`general_video_table`:

- `uuid` - primary key видео;
- `video_name` - имя исходного файла;
- `storage_key` - key объекта в MinIO;
- `status` - текущее состояние, сейчас используются `UPLOADING` и `READY`;
- `original_size_bytes` - размер файла из MinIO после подтверждения;
- `original_content_type` - content type из MinIO;
- `original_etag` - ETag объекта в MinIO;
- `created_at`;
- `updated_at`.

`meta_video_table`:

- `uuid` - FK на `general_video_table`;
- `width`;
- `height`;
- `fps`;
- `duration_ms`;
- `video_codec`;
- `audio_codec`;
- `bitrate`.

## Как используется сейчас

`upload_service`:

1. На `POST /api/videos/init-upload` создаёт запись в `general_video_table` со статусом `UPLOADING`.
2. Возвращает браузеру `uuid`, `upload_url` и `storage_key`.
3. На `POST /api/videos/{uuid}/upload-complete` проверяет файл в MinIO через `HEAD`.
4. Обновляет запись до статуса `READY`, сохраняет размер, content type и ETag.

В коде `upload_service` дополнительно вызывается compatibility check, который добавляет недостающие колонки `original_size_bytes`, `original_content_type`, `original_etag`, если их нет в старой локальной базе.

## Проверка

```bash
docker compose exec postgres psql -U prom_app -d prom_app -c "SELECT 1 AS db_is_alive;"
docker compose exec postgres psql -U prom_app -d prom_app -c "SELECT * FROM general_video_table;"
docker compose exec postgres psql -U prom_app -d prom_app -c "SELECT * FROM meta_video_table;"
```

## Ограничения

- Сейчас нет полноценного migration tool.
- `initdb` не заменяет миграции для stage/prod.
- Для следующего этапа стоит завести `migrations/000001_create_video_tables.up.sql` и `.down.sql`, а запуск миграций вынести в Makefile или отдельный compose service.
