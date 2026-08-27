# Docker

В этой папке лежит общий `docker-compose.yaml` для локального запуска инфраструктуры проекта.

## services

`services` описывает контейнеры, которые поднимаются вместе:

- `s3-storage` - S3-compatible хранилище на базе MinIO.
- `s3_init` - init-контейнер, который автоматически создает тестовые бакеты в MinIO.

Позже сюда можно добавить остальные микросервисы:

- `api_gateway`
- `upload_service`
- `session_service`
- `websocket_service`

Внутри docker-compose сервисы видят друг друга по имени сервиса. Например, если `upload_service` будет работать с S3, он сможет обращаться к хранилищу так:

```text
http://s3-storage:9000
```

С хоста то же хранилище доступно через:

```text
http://localhost:9000
```

## s3-storage

`s3-storage` использует MinIO и открывает два порта:

- `9000` - S3 API для загрузки и чтения файлов.
- `9001` - web-консоль MinIO.

Доступ в web-консоль:

```text
URL:      http://localhost:9001
Login:    prom_app
Password: prom_app_password
```

## s3_init

`s3_init` запускается после `s3-storage`, подключается к MinIO через внутренний адрес:

```text
http://s3-storage:9000
```

Затем создает бакеты:

- `video-originals-prom`
- `video-derived-prod`
- `video-detections-prod`

Команда создания бакетов идемпотентная: если бакет уже существует, контейнер не падает.

## volumes

`volumes` описывает постоянные данные контейнеров.

Сейчас используется volume:

- `s3_storage_data` - хранит данные MinIO из директории `/data` внутри контейнера.

Благодаря volume файлы в S3 не пропадут после перезапуска контейнера.

## Схема бакетов

Целевая схема object storage описана отдельно:

```text
docker-docs/MinIO.md
```

## Запуск

Перейти в папку с compose-файлом:

```bash
cd prom_app/docker
```

Проверить конфигурацию:

```bash
docker compose -f docker-compose.yaml config
```

Поднять MinIO и init-контейнер:

```bash
docker compose -f docker-compose.yaml up -d
```

Проверить контейнеры:

```bash
docker compose -f docker-compose.yaml ps
```

Проверить созданные бакеты:

```bash
docker run --rm --network docker_default --entrypoint /bin/sh minio/mc:latest -c 'mc alias set local http://s3-storage:9000 prom_app prom_app_password >/dev/null && mc ls local'
```

Остановка:

```bash
docker compose -f docker-compose.yaml down
```
