# lct_2026
## Целевая структура

```text
lct_2026/
├── README.md ✅
├── .env ✅
├── .gitignore ✅
├── Makefile
├── docker-compose.yml ✅
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
│   ├── postgres/ ✅
│   ├── minio/ ✅
│   ├── redis/ ✅
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