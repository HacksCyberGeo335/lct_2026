# Audith: аудит структуры репозитория

Дата аудита: 2026-09-01.

## Короткий вывод

Репозиторий стал ближе к deployable-приложению: появилась единая корневая `docker-compose.yml`, локальная инфраструктура PostgreSQL/Redis/MinIO и отдельный React + TypeScript + Vite frontend, который собирается и отдается через nginx-контейнер.

При этом серверная часть всё ещё остается черновым скелетом. Главные риски для серверного развёртывания: пустые Dockerfile у backend-сервисов, отсутствие миграционного механизма, отсутствие `.env.example` на уровне всего приложения, захардкоженные credentials в compose, нет CI/CD, нет контрактов API и нет единого operational README с командами запуска, сборки и деплоя.

## Что сейчас хорошо

- Есть понятное разделение на `prom_app/services`, `prom_app/frontend` и `infra`.
- `api_gateway` использует нормальную Go-структуру: `cmd/<service>`, `internal/config`, `internal/handler`, `internal/router`, `internal/server`.
- В корневом `docker-compose.yml` уже описаны PostgreSQL, Redis, MinIO, init-контейнер MinIO и frontend.
- Frontend вынесен в отдельное приложение: React, TypeScript, Vite, Dockerfile, README, `.env.example`, отдельный API-слой.
- MinIO-документация и PostgreSQL-документация лежат отдельно в `infra`.
- SQL init-скрипт базы хранится отдельно от кода приложения.
- `.gitignore` уже исключает Python/Go build artifacts, env-файлы, IDE-файлы и часть R&D-данных.
- `rnd` фактически отделен от `prom_app`, что лучше, чем смешивание research-кода с application-кодом внутри одного дерева.

## Основные проблемы

- Backend-сервисы пока не являются deployable: `prom_app/services/api_gateway/Dockerfile`, `upload_service/Dockerfile`, `session_service/Dockerfile`, `websocket_service/Dockerfile` пустые.
- В `docker-compose.yml` добавлен frontend, но backend-сервисы ещё не собираются и не запускаются как контейнеры.
- Корневой `README.md` почти пустой, поэтому нет единой инструкции для запуска всего проекта.
- Нет корневого `.env.example` для PostgreSQL, Redis, MinIO, Gateway, frontend API URL, bucket names и портов.
- В `docker-compose.yml` захардкожены логины и пароли: `prom_app`, `prom_app_password`.
- Нет разделения конфигураций `local/dev/stage/prod`.
- Имена bucket'ов смешивают окружения: `video-originals-prom`, `video-derived-prod`, `video-detections-prod`.
- База использует только `infra/postgres/initdb`; это подходит для первого локального запуска, но не для контролируемых обновлений схемы на сервере.
- Нет `migrations/` и команды миграций.
- Нет CI-пайплайна: lint, tests, frontend build, Go build, Docker build, `docker compose config`.
- Нет Makefile/Taskfile/scripts для стандартных команд: `up`, `down`, `build`, `test`, `lint`, `migrate`.
- Нет `contracts/`: OpenAPI/proto/event-схемы не зафиксированы, хотя архитектура движется к нескольким сервисам.
- `upload_service`, `session_service`, `websocket_service` пока выглядят как заготовки без реального кода.
- `.idea` всё ещё присутствует в рабочем дереве; правило в `.gitignore` есть, но уже попавшие в git IDE-файлы надо удалить из индекса.

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
│   └── README.md
├── prom_app/
│   ├── frontend/
│   └── services/
│       ├── api_gateway/
│       ├── upload_service/
│       ├── session_service/
│       └── websocket_service/
└── research/
    ├── notebooks/
    └── experiments/
```

Эту структуру можно вводить постепенно. Прямо сейчас не обязательно переносить `prom_app/services` в корень: важнее сначала сделать текущую структуру запускаемой, документированной и проверяемой.

## План рефакторинга и структуризации

### Этап 1. Зафиксировать app-root и команды запуска

Цель: любой разработчик должен понять, как поднять проект за 5 минут.

1. Заполнить корневой `README.md`: назначение проекта, требования, порты, команды запуска, troubleshooting.
2. Добавить корневой `.env.example`.
3. Подключить `.env` в `docker-compose.yml` через `${VAR:-default}`.
4. Добавить `Makefile` с командами `up`, `down`, `build`, `logs`, `test`, `lint`, `compose-config`.

### Этап 2. Довести Docker Compose до полного local stack

Цель: `docker compose up --build` должен поднимать весь локальный vertical slice.

1. Добавить service `api_gateway` в `docker-compose.yml`.
2. Заполнить Dockerfile для `api_gateway`.
3. Добавить healthcheck для `api_gateway`.
4. Передать в `api_gateway` env-переменные для PostgreSQL, Redis и S3.
5. Подключить frontend к gateway через `VITE_API_BASE_URL`.
6. Оставить `upload_service`, `session_service`, `websocket_service` вне compose до появления реального кода или добавить их как явно stub-сервисы.

### Этап 3. Убрать секреты из compose

Цель: compose должен быть безопасным шаблоном, а не местом хранения credentials.

1. Заменить `prom_app` и `prom_app_password` на переменные окружения.
2. Добавить значения по умолчанию только для local-dev.
3. Описать в README, что production `.env` не коммитится.
4. Проверить, что frontend не получает MinIO credentials.

### Этап 4. Ввести миграции БД

Цель: схема БД должна обновляться управляемо, а не только при первом создании volume.

1. Создать `migrations/`.
2. Перенести `infra/postgres/initdb/001_video_tables.sql` в `migrations/000001_create_video_tables.up.sql`.
3. Добавить `000001_create_video_tables.down.sql`.
4. Выбрать инструмент миграций: `golang-migrate`, `goose` или аналог.
5. Добавить команду `make migrate`.
6. Оставить `initdb` только для bootstrap локальной БД или убрать после появления migration container.

### Этап 5. Нормализовать окружения и bucket names

Цель: не смешивать local/dev/prod в названиях и конфигурации.

1. Ввести переменные `APP_ENV`, `S3_ENDPOINT`, `S3_BUCKET_ORIGINALS`, `S3_BUCKET_DERIVED`, `S3_BUCKET_DETECTIONS`.
2. Для local использовать согласованные имена: `video-originals-local`, `video-derived-local`, `video-detections-local`.
3. Для prod задавать bucket names только через production `.env`.
4. Обновить MinIO init-контейнер, чтобы он создавал bucket'ы из env.

### Этап 6. Зафиксировать API-контракты

Цель: frontend, gateway и будущие сервисы должны иметь общий контракт.

1. Создать `contracts/openapi/api-gateway.yaml`.
2. Описать `POST /api/videos/init-upload`, `POST /api/videos/{uuid}/upload-complete` и health endpoints.
3. Описать request/response DTO и ошибки.
4. Добавить проверку OpenAPI в CI.

### Этап 7. CI/CD минимум

Цель: не принимать изменения, которые не собираются.

1. Добавить GitHub Actions или другой CI.
2. Проверять frontend: `npm ci`, `npm run build`.
3. Проверять Go: `go test ./...`, `go build ./...`.
4. Проверять Docker: `docker compose config`, `docker compose build frontend api_gateway`.
5. Добавить линтеры после стабилизации кода.

### Этап 8. Очистить репозиторий от локальных файлов

Цель: в git должен лежать только воспроизводимый проектный код.

1. Убедиться, что `.idea/` есть в `.gitignore`.
2. Удалить уже отслеживаемые `.idea` файлы из индекса командой `git rm --cached -r .idea`.
3. Проверить, что `rnd/notebooks` и тяжелые артефакты не попадают в git.
4. При необходимости переименовать `rnd` в `research`.

## Минимальный порядок работ

Если нужно двигаться без большого рефакторинга, оптимальный порядок такой:

1. Корневой `.env.example`.
2. Переменные окружения в `docker-compose.yml`.
3. Dockerfile для `api_gateway`.
4. Service `api_gateway` в compose.
5. Корневой README с командами запуска.
6. Makefile.
7. Миграции БД.
8. OpenAPI-контракт для текущего upload flow.
9. CI для frontend build, Go build/test и Docker compose config.
10. Разделение local/prod compose-конфигураций.

## Итоговая оценка

Как черновой скелет проект уже выглядит лучше, чем в предыдущем аудите: появился frontend и корневой compose начал становиться точкой сборки приложения. Но до серверного развёртывания ещё не хватает backend-контейнеризации, env-дисциплины, миграций, контрактов, CI и документации запуска.

Главный следующий шаг: сделать `api_gateway` полноценным контейнеризованным сервисом в `docker-compose.yml`, а затем убрать credentials и bucket names в `.env.example`.
