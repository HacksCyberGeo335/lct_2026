# Audith: аудит структуры репозитория

Дата аудита: 2026-09-01.

## Короткий вывод

Проект уже имеет рабочий локальный vertical slice: frontend, API Gateway, upload service, PostgreSQL, Redis, MinIO и observability-стек поднимаются через корневой `docker-compose.yml`. Frontend собирается через Vite и отдаётся nginx-контейнером, API Gateway проксирует video API в `upload_service`, а `upload_service` пишет состояние загрузки в PostgreSQL и проверяет объект в MinIO.

Основная проблема сместилась: теперь это не отсутствие запуска вообще, а недостаточная production-дисциплина. Нужно закрепить миграции, контракты API, Makefile, CI, разделение окружений, нормализацию bucket names и документацию deployment-пути.

## Что сейчас хорошо

- Есть единый compose stack в корне проекта.
- Инфраструктура вынесена в `infra`: PostgreSQL, Redis, MinIO, Grafana/Loki/Alloy.
- MinIO теперь имеет отдельный `infra/minio/Dockerfile`, при этом service name `s3-storage` и endpoint `http://s3-storage:9000` сохранены.
- `api_gateway` и `upload_service` имеют рабочие Go Dockerfile и запускаются как контейнеры.
- `api_gateway` отделён от upload-логики и проксирует `/api/videos/*` во внутренний `upload_service`.
- `upload_service` реализует текущий upload contract: `init-upload` и `upload-complete`.
- Frontend вынесен в `prom_app/frontend`, использует React, TypeScript, Vite и собирается в nginx runtime.
- PostgreSQL init schema хранится отдельно в `infra/postgres/initdb`.
- Observability stack собирает JSON access logs от `frontend`, `api_gateway`, `upload_service`.
- `.gitignore` уже исключает env-файлы, IDE-файлы, build/cache и часть research-данных.

## Основные проблемы

- Нет корневого `.env.example`, хотя `.env` уже используется.
- Корневой `README.md` не должен быть единственным знанием о запуске, но ему всё равно нужна краткая operational-инструкция.
- Нет `Makefile` для стандартных команд.
- Нет migration tool и каталога `migrations/`; `initdb` работает только при первом создании PostgreSQL volume.
- Нет API-контракта в `contracts/openapi`.
- Нет CI для `docker compose config`, Docker build, frontend build и Go tests.
- `session_service` и `websocket_service` сейчас отсутствуют как рабочие сервисы в compose.
- Bucket names всё ещё смешивают окружения: `video-originals-prom`, `video-derived-prod`, `video-detections-prod`.
- Local credentials лежат в `.env`; для production нужен отдельный секретный контур.
- Прямой PUT в MinIO сейчас зависит от public anonymous policy для originals bucket; для production лучше перейти на presigned URL.
- `.idea` игнорируется, но если файлы уже отслеживаются git, их нужно удалить из индекса.

## Текущая структура приложения

```text
prom_app/
├── AUDITH.md
├── frontend/
│   ├── Dockerfile
│   ├── README.md
│   ├── nginx.conf
│   ├── package.json
│   └── src/
└── services/
    ├── SERVICES.md
    ├── api_gateway/
    │   ├── APIGateWay.md
    │   ├── Dockerfile
    │   ├── cmd/api_gateway/main.go
    │   └── internal/
    └── upload_service/
        ├── README.md
        ├── Dockerfile
        ├── cmd/upload_service/main.go
        └── internal/
```

## Текущий runtime flow

```text
Browser
  -> frontend http://localhost:3000
  -> POST http://localhost:8080/api/videos/init-upload
  -> api_gateway
  -> upload_service
  -> PostgreSQL row status=UPLOADING
  <- uuid, upload_url, storage_key
  -> PUT http://localhost:9000/<bucket>/<uuid>/<file_name>
  -> POST http://localhost:8080/api/videos/<uuid>/upload-complete
  -> api_gateway
  -> upload_service
  -> HEAD http://s3-storage:9000/<bucket>/<uuid>/<file_name>
  -> PostgreSQL row status=READY
```

## Рекомендуемая целевая структура

```text
lct_2026/
├── README.md
├── .env.example
├── .gitignore
├── Makefile
├── docker-compose.yml
├── docker-compose.prod.yml
├── docs/
│   ├── architecture.md
│   ├── deployment.md
│   ├── api.md
│   ├── storage.md
│   └── database.md
├── deploy/
│   ├── nginx/
│   ├── systemd/
│   └── scripts/
├── migrations/
│   ├── 000001_create_video_tables.up.sql
│   └── 000001_create_video_tables.down.sql
├── contracts/
│   ├── openapi/
│   ├── proto/
│   └── events/
├── infra/
│   ├── postgres/
│   ├── minio/
│   ├── redis/
│   └── grafana/
├── prom_app/
│   ├── frontend/
│   └── services/
└── research/
    ├── notebooks/
    └── experiments/
```

## План рефакторинга и структуризации

### Этап 1. Operational baseline

1. Создать корневой `.env.example` на основе текущего `.env`.
2. Добавить `Makefile` с командами `up`, `down`, `build`, `logs`, `test`, `lint`, `compose-config`.
3. Проверить, что `docker compose config` работает без локальных неявных зависимостей.
4. Описать текущие URL в корневой документации или `docs/deployment.md`.

### Этап 2. Миграции

1. Создать `migrations/`.
2. Перенести текущую схему из `infra/postgres/initdb/001_video_tables.sql` в `000001_create_video_tables.up.sql`.
3. Добавить `000001_create_video_tables.down.sql`.
4. Выбрать migration tool: `goose` или `golang-migrate`.
5. Добавить `make migrate`.

### Этап 3. Контракты API

1. Создать `contracts/openapi/api-gateway.yaml`.
2. Описать `/health`, `/api/videos/init-upload`, `/api/videos/{uuid}/upload-complete`.
3. Зафиксировать DTO `InitUploadRequest`, `InitUploadResponse` и error responses.
4. Добавить проверку OpenAPI в CI.

### Этап 4. Environment split

1. Разделить local и production defaults.
2. Нормализовать bucket names по окружениям.
3. Убрать production secrets из файлов репозитория.
4. Для production заменить public MinIO upload на presigned URL.

### Этап 5. CI

1. Проверять frontend: `npm ci`, `npm run build`.
2. Проверять Go: `go test ./...`, `go build ./...`.
3. Проверять Docker: `docker compose config`, `docker compose build`.
4. Проверять документацию и OpenAPI после появления контрактов.

## Итоговая оценка

Для локальной разработки проект уже достаточно собран: сервисы запускаются, frontend связан с backend, MinIO и PostgreSQL включены в flow. Для серверного развёртывания нужно довести дисциплину конфигурации, миграций, контрактов и CI.
