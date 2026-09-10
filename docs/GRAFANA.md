# Grafana, Loki, Alloy

Локальный observability-стек собирает Docker-логи сервисов и показывает HTTP access logs в Grafana.

## Сервисы

- `grafana` - UI Grafana.
- `loki` - хранилище логов.
- `alloy` - агент сбора логов из Docker через `/var/run/docker.sock`.

Сервисы описаны в корневом `docker-compose.yml`.

## URL и доступы

```text
Grafana: http://localhost:${GRAFANA_HOST_PORT:-3001}
Loki:    http://localhost:${LOKI_HOST_PORT:-3100}
Alloy:   http://localhost:${ALLOY_HOST_PORT:-12345}
```

Локальные credentials Grafana:

```text
Login:    ${GRAFANA_ADMIN_USER:-admin}
Password: ${GRAFANA_ADMIN_PASSWORD:-admin}
```

## Конфигурация

```text
infra/grafana/
├── alloy/
│   └── config.alloy
├── grafana/
│   ├── dashboards/
│   │   └── prom_app_http_logs.json
│   └── provisioning/
└── loki/
    └── loki.yml
```

`grafana` монтирует provisioning и dashboard-файлы из `infra/grafana/grafana`.

`loki` читает конфиг из:

```text
infra/grafana/loki/loki.yml
```

`alloy` читает конфиг из:

```text
infra/grafana/alloy/config.alloy
```

## Логи приложения

JSON access logs пишутся для:

- `api_gateway`
- `upload_service`
- `frontend`

Инфраструктурные контейнеры `postgres`, `redis`, `s3-storage`, `s3_init`, `loki`, `alloy`, `grafana` также собираются в Loki как raw Docker logs.

## Dashboard

Dashboard:

```text
Folder: Prom App
Name:   Prom App HTTP/API Logs
```

Панели ориентированы на:

- количество HTTP-запросов по статусам;
- p95 latency по endpoint;
- error rate;
- количество 5xx;
- последние HTTP-запросы;
- HTTP-ошибки;
- raw logs контейнеров.

## Проверка

```bash
docker compose ps grafana loki alloy
curl -I http://localhost:3001
curl -I http://localhost:3100/ready
```

Если Grafana не показывает логи, сначала проверить, что `alloy` имеет read-only доступ к Docker socket:

```text
/var/run/docker.sock:/var/run/docker.sock:ro
```
