# MinIO

MinIO используется как локальное S3-compatible object storage для исходных видео и будущих производных артефактов обработки.

## Сервисы

- `s3-storage` - MinIO server.
- `s3_init` - одноразовый init-контейнер на базе `minio/mc`, который создаёт bucket'ы.

`s3-storage` собирается из:

```text
infra/minio/Dockerfile
```

Dockerfile оставляет официальную MinIO-логику без изменений и только фиксирует отдельную infra-точку сборки:

```dockerfile
ARG MINIO_BASE_IMAGE=minio/minio:latest

FROM ${MINIO_BASE_IMAGE}
```

## URL

S3 API:

```text
Внутри docker-compose: http://s3-storage:9000
С локальной машины:     http://localhost:${MINIO_API_HOST_PORT:-9000}
```

Web console:

```text
http://localhost:${MINIO_CONSOLE_HOST_PORT:-9001}
```

Локальные credentials:

```text
Login:    ${MINIO_ROOT_USER:-prom_app}
Password: ${MINIO_ROOT_PASSWORD:-prom_app_password}
```

## Переменные окружения

Основные переменные из `.env`:

```text
MINIO_BASE_IMAGE=minio/minio:latest
MINIO_IMAGE=prom_app_minio:local
MINIO_MC_IMAGE=minio/mc:latest
MINIO_CONTAINER_NAME=prom_app_s3_storage
MINIO_INIT_CONTAINER_NAME=prom_app_s3_init
MINIO_API_HOST_PORT=9000
MINIO_CONSOLE_HOST_PORT=9001
MINIO_ROOT_USER=prom_app
MINIO_ROOT_PASSWORD=prom_app_password
MINIO_INTERNAL_ENDPOINT=http://s3-storage:9000
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
MINIO_ORIGINALS_BUCKET=video-originals-prom
MINIO_DERIVED_BUCKET=video-derived-prod
MINIO_DETECTIONS_BUCKET=video-detections-prod
```

`MINIO_INTERNAL_ENDPOINT` используется сервисами внутри compose.

`MINIO_PUBLIC_ENDPOINT` попадает в ответ `init-upload`, чтобы браузер мог выполнить прямой PUT в MinIO с локальной машины.

## Bucket'ы

`s3_init` создаёт:

- `${MINIO_ORIGINALS_BUCKET:-video-originals-prom}` - исходные видео;
- `${MINIO_DERIVED_BUCKET:-video-derived-prod}` - будущие производные файлы;
- `${MINIO_DETECTIONS_BUCKET:-video-detections-prod}` - будущие результаты детекций.

Для originals bucket дополнительно выставляется public anonymous policy, потому что текущий frontend загружает файл прямым unsigned `PUT` по URL, который вернул backend.

## Текущий upload flow

```text
Browser
  -> POST /api/videos/init-upload
  -> получает upload_url=http://localhost:9000/<bucket>
  -> PUT http://localhost:9000/<bucket>/<uuid>/<file_name>
  -> POST /api/videos/<uuid>/upload-complete
```

`upload_service` после `upload-complete` делает `HEAD` во внутренний MinIO endpoint и обновляет запись в PostgreSQL.

## Проверка

```bash
docker compose ps s3-storage s3_init
curl -I http://localhost:9000/minio/health/live
docker compose run --rm --entrypoint /bin/sh s3_init -c 'mc alias set local http://s3-storage:9000 prom_app prom_app_password >/dev/null && mc ls local'
```

Ожидаемые bucket'ы:

```text
video-originals-prom/
video-derived-prod/
video-detections-prod/
```

## Ограничения текущего local setup

- В local-конфигурации MinIO credentials лежат в `.env`.
- Для production нужно заменить public unsigned upload на presigned URL или другой контролируемый механизм доступа.
- Имена bucket'ов пока смешивают `prom` и `prod`; их лучше нормализовать при разделении окружений.
