Рализуй мне следующее взаимодействие у проекта:
1) мы отправляем запрос POST запрос api/videos/init-upload:
{
    "file_name": <имя_файла>
    "size": <размер_файла>
}
2) через API GateWay мы роутим в сервис upload_service, где мы создаём запись о видео в таблицу general_video_table со статусом UPLOADING
3) Происходит INSERT в таблицу general_video_table (со статусом UPLOADING)
4) После записи мы отправляем HTTP 200 OK на frontent с таким контентом:
{ 
    "uuid": 021472d8-a659-47de-893d-bedc24d015e7
    "upload_url": http://localhost:9000/video-originals-prom
    "storage_key": video-originals-prom/
}
5) frontend загружает файл напрямую в minio по предоставленной ссылке, где мы в бакете video-originals-prom/ создаём папку с uuid и загружаем в этот бакет и папку файл
6) файл сохраняется в minio по пути в определённый бакет
7) получаем HTTP 200 OK (загрузка завершена), где S3 подтверждает успешную загрузку
8) frontend уведомляет backend о завершении загрузки:
   * POST api/videos/.../upload-complete
   * проверяем существование файла в minio (HEAD Ззапрос) -> HEAD videos/.../original.mp4 -> 200 OK (файл существует)
   * обновляем статус видео на READY, сохраняем метаданные файла -> UPDATE general_video_table -> статус видео на READY





Аудит структуры репозитория
 
Короткий вывод: текущая структура пока пригодна как черновой скелет, но для будущего серверного развёртывания она слабая. Видно направление на микросервисную архитектуру, PostgreSQL и
MinIO, но нет корневой точки запуска всего приложения, окружений, CI/CD, миграций, production-конфигурации и реальной упаковки сервисов.
 
Что сейчас хорошо:
- Есть разделение на prom_app/services и infra/postgres, infra/minio, infra/redis.
- У api_gateway выбран нормальный Go-layout: cmd/<service>, internal/config, internal/handler, internal/router, internal/server.
- Инфраструктура PostgreSQL и MinIO вынесена отдельно, есть корневой docker-compose для локального запуска.
- SQL-схема лежит отдельно от кода приложения.
- В .gitignore исключены venv, build/cache, env-файлы, часть R&D-данных.
 
Основные проблемы для серверного развёртывания:
- docker-compose лежит в корне и поднимает только инфраструктуру. Для деплоя нужна единая композиция всего приложения: gateway, upload/session/websocket-сервисы, БД,
S3, сети, healthcheck, env.
- Dockerfile у всех сервисов пустые, кроме postgres. Сейчас сервисы невозможно собрать и развернуть как контейнеры.
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
├── docker-compose.yml ✅
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
│   ├── postgres/ ✅
│   ├── minio/ ✅
│   ├── redis/ ✅
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
- infra/postgres/initdb/001_video_tables.sql -> migrations/000001_create_video_tables.up.sql
- docker-compose.yml -> docker-compose.dev.yml или infra/compose/docker-compose.infra.yml
- infra/minio/docs/MinIO.md -> docs/storage.md
- infra/postgres/README.md -> docs/database.md
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
