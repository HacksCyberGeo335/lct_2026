# Grafana + Loki

Локальный observability-стек для просмотра логов проекта.

Состав:

- `grafana` - UI на `http://localhost:3001`
- `loki` - хранилище логов на `http://localhost:3100`
- `alloy` - сбор Docker-логов через `/var/run/docker.sock`

Доступ в Grafana:

- Login: `admin`
- Password: `admin`

Dashboard:

- Folder: `Prom App`
- Name: `Prom App HTTP/API Logs`

Что показывает dashboard:

- количество HTTP-запросов по статусам
- p95 latency по endpoint
- error rate
- количество 5xx
- последние HTTP-запросы
- HTTP-ошибки
- raw logs всех контейнеров проекта

Фильтры:

- `Service` - сервис или несколько сервисов
- `Endpoint regex` - регулярное выражение по endpoint
- `Raw log search` - поиск по сырым логам

HTTP access logs пишутся в JSON для:

- `api_gateway`
- `upload_service`
- `frontend`

Инфраструктурные сервисы `postgres`, `redis`, `s3-storage`, `s3_init`, `loki`, `alloy`, `grafana` тоже собираются в Loki как raw logs.

