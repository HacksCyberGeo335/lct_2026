# PostgreSQL

PostgreSQL хранит состояние загруженных фото/видео, метаданные оригиналов и очереди обработки.

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
- `media_type` - `video` или `photo` (для старых записей по умолчанию `video`);
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
4. В одной транзакции обновляет запись до `READY`, сохраняет размер, content type и ETag, создаёт задачи `yolo` и `vlm` в `processing_jobs`.

Маршруты `/api/photos/...` используют ту же схему для каждого фото отдельно. Повтор подтверждения не дублирует задачи.

В коде `upload_service` compatibility check добавляет `media_type`, поля `original_*` и таблицы обработки в существующей БД. Для новых volumes схема очередей лежит в `infra/postgres/initdb/002_processing_jobs.sql`; её копия `upload_service/internal/repository/processing.sql` встроена в бинарный файл Go.

## Очереди обработки

`processing_jobs`: уникальная пара `(media_uuid, kind)`, где kind — `yolo` или `vlm`; статус `QUEUED/RUNNING/SUCCEEDED/FAILED`, число и лимит попыток, время следующей попытки, lease/token, ошибка и JSON-ссылка `result` на manifest в S3. Захват через `FOR UPDATE SKIP LOCKED`; heartbeat и token защищают от завершения устаревшим воркером.

`analysis_tasks`: одна строка на `media_uuid`, статус `QUEUED`, версия события и ссылки на оба результата в `payload`. Создаётся после обеих успешных веток. Это вход следующего этапа анализа; его потребитель пока не реализован.

Обе таблицы ссылаются на `general_video_table` с `ON DELETE CASCADE`. Удаление SQL-строк не удаляет объекты S3. Контракты, повторы и восстановление описаны в [INFERENCE.md](INFERENCE.md).

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
