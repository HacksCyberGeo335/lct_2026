# api_gateway

`api_gateway` - входная точка для внешних HTTP-запросов к сервисам `prom_app`.

Сервис будет отвечать за прием клиентских запросов, маршрутизацию к внутренним сервисам, базовую проверку доступности, middleware уровня API и единый слой публичных HTTP-endpoint'ов.

## Структура

```text
api_gateway/
├── cmd/
│   └── api_gateway/
│       └── main.go
├── internal/
│   ├── config/
│   │   └── config.go
│   ├── handler/
│   │   └── health.go
│   ├── middleware/
│   │   └── middleware.go
│   ├── router/
│   │   └── router.go
│   └── server/
│       └── server.go
├── Dockerfile
├── go.mod
└── README.md
```

## Назначение директорий

- `cmd/api_gateway` - точка входа приложения.
- `internal/config` - загрузка и описание конфигурации сервиса.
- `internal/handler` - HTTP-handlers публичного API.
- `internal/middleware` - общие middleware для HTTP-запросов.
- `internal/router` - регистрация маршрутов.
- `internal/server` - настройка и запуск HTTP-сервера.
