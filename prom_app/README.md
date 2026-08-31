Аудит структуры репозитория
 
Короткий вывод: текущая структура пока пригодна как черновой скелет, но для будущего серверного развёртывания она слабая. Видно направление на микросервисную архитектуру, PostgreSQL и
MinIO, но нет корневой точки запуска всего приложения, окружений, CI/CD, миграций, production-конфигурации и реальной упаковки сервисов.
 
Что сейчас хорошо:
- Есть разделение на prom_app/services, prom_app/database, prom_app/storage_sys.
- У api_gateway выбран нормальный Go-layout: cmd/<service>, internal/config, internal/handler, internal/router, internal/server.
- Инфраструктура PostgreSQL и MinIO вынесена отдельно, есть docker-compose для локального запуска.
- SQL-схема лежит отдельно от кода приложения.
- В .gitignore исключены venv, build/cache, env-файлы, часть R&D-данных.
 
Основные проблемы для серверного развёртывания:
- docker-compose лежит в prom_app/storage_sys и поднимает только инфраструктуру. Для деплоя нужна единая композиция всего приложения: gateway, upload/session/websocket-сервисы, БД,
S3, сети, healthcheck, env.
- Dockerfile у всех сервисов пустые, кроме database. Сейчас сервисы невозможно собрать и развернуть как контейнеры.
- Корневые README почти пустые. Нет понятной инструкции: как запустить локально, как собрать, какие переменные окружения нужны, какие порты используются.
- Нет .env.example. При этом пароли захардкожены в docker-compose: prom_app_password. Для сервера так нельзя.
- Нет разделения окружений: local/dev/stage/prod. Сейчас MinIO-бакеты смешивают prom/prod в названиях: video-originals-prom, video-derived-prod, video-detections-prod.
- Нет миграционного механизма БД. initdb подходит для первого локального запуска, но не для обновления схемы на сервере.
- В репозитории лежит .idea, включая workspace.xml. Это локальные IDE-файлы, их лучше не хранить в проекте.
- rnd лежит рядом с production-приложением. Для разработки это допустимо, но для деплоя надо явно отделить research/notebooks/artifacts от deployable-кода.
- У сервисов session_service, upload_service, websocket_service есть папки, но фактически нет кода и документации.
- Нет CI: линтеры, тесты, сборка Docker-образов, проверка compose-конфига.
- Нет Makefile/Taskfile/scripts для стандартных команд: dev, test, lint, build, up, down, migrate.
- Нет contracts/openapi/proto/events. Для микросервисов быстро станет непонятно, кто с кем и по какому API общается.

Как я бы структурировал проект под серверное развёртывание:

2026/
├── README.md
├── .gitignore
├── .env.example
├── Makefile
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── docs/
│   ├── architecture.md
│   ├── deployment.md
│   ├── storage.md
│   └── database.md
├── deploy/
│   ├── nginx/
│   ├── systemd/ или k8s/
│   └── scripts/
├── migrations/
│   ├── 000001_create_video_tables.up.sql
│   └── 000001_create_video_tables.down.sql
├── services/
│   ├── api_gateway/
│   │   ├── cmd/api_gateway/main.go
│   │   ├── internal/...
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   └── README.md
│   ├── upload_service/
│   │   ├── cmd/upload_service/main.go
│   │   ├── internal/...
│   │   ├── Dockerfile
│   │   └── README.md
│   ├── session_service/
│   └── websocket_service/
├── infra/
│   ├── postgres/
│   ├── minio/
│   └── README.md
├── contracts/
│   ├── openapi/
│   ├── proto/
│   └── events/
├── scripts/
│   ├── dev-up.sh
│   ├── dev-down.sh
│   └── migrate.sh
└── research/
    ├── notebooks/
    └── experiments/
Что перенести из текущей структуры:
- prom_app/services/* -> services/*
- prom_app/database/initdb/001_video_tables.sql -> migrations/000001_create_video_tables.up.sql
- prom_app/storage_sys/docker-compose.yaml -> docker-compose.dev.yml или infra/compose/docker-compose.infra.yml
- prom_app/storage_sys/docs/MinIO.md -> docs/storage.md
- prom_app/database/README.md -> docs/database.md
- rnd -> research, при этом тяжелые artefacts/store лучше держать вне git или через DVC/S3
 
Минимальный порядок исправлений без переписывания архитектуры:
1. Добавить корневой docker-compose.yml, который собирает все сервисы и инфраструктуру.
2. Заполнить Dockerfile для каждого сервиса.
3. Добавить .env.example и убрать пароли/логины из compose в переменные окружения.
4. Ввести миграции БД вместо initdb-only подхода.
5. Убрать .idea из git, оставить только .gitignore правило.
6. Перенести prom_app на уровень корня как services/infra/docs или хотя бы сделать prom_app единственным app-root с полным README.
7. Добавить Makefile с командами: make up, make down, make test, make lint, make migrate.
8. Описать API-контракты gateway/upload/session/websocket.
9. Добавить CI-пайплайн: lint, test, docker build, docker compose config.
10. Разделить dev/prod конфигурации и имена бакетов.
 
Итоговая оценка: как стартовый черновик - нормально; как проект, готовящийся к серверному развёртыванию, структура пока недособрана. Главная проблема не в названии папок, а в
отсутствии deployable application root: единого запуска, конфигураций окружений, миграций, контейнеризации сервисов и документации запуска.