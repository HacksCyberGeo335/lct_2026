# Frontend

React + TypeScript + Vite frontend для загрузки видео.

Пользователь выбирает видео, frontend вызывает API Gateway для инициализации загрузки, загружает файл напрямую в MinIO и затем подтверждает завершение загрузки через backend.

## Стек

- React
- TypeScript
- Vite
- nginx для production runtime в Docker

## Структура

```text
frontend/
├── Dockerfile
├── README.md
├── index.html
├── nginx.conf
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── styles.css
    ├── api/
    │   └── videoApi.ts
    └── types/
        └── video.ts
```

## Локальный запуск без Docker

```bash
cd prom_app/frontend
npm install
npm run dev
```

Vite dev server:

```text
http://localhost:5173
```

## Production build

```bash
cd prom_app/frontend
npm ci
npm run build
```

## Docker

Из корня репозитория:

```bash
docker compose up --build frontend
```

Frontend URL:

```text
http://localhost:${FRONTEND_HOST_PORT:-3000}
```

## Environment

Frontend использует только публичную Vite-переменную:

```text
VITE_API_BASE_URL=http://localhost:8080
```

Если значение не задано, API URL строятся относительно текущего origin.

MinIO credentials во frontend не передаются. Browser использует только `upload_url`, который пришёл от backend.

## API flow

```text
POST <VITE_API_BASE_URL>/api/videos/init-upload
    body: { "file_name": string, "size": number }
    response: { "uuid": string, "upload_url": string, "storage_key": string }

PUT <upload_url>/<uuid>/<encoded_file_name>
    body: File
    Content-Type: file.type || application/octet-stream

POST <VITE_API_BASE_URL>/api/videos/<uuid>/upload-complete
    body: {}
```

PUT выполняется через `XMLHttpRequest`, потому что browser Fetch API не даёт upload progress для обычного PUT.

## UI states

- initial: файл не выбран;
- selected: имя и размер файла;
- initializing: запрос `init-upload`;
- uploading: PUT в MinIO и progress bar;
- completing: запрос `upload-complete`;
- success: успешная загрузка;
- error: ошибка конкретного этапа.

## nginx

`nginx.conf` находится рядом с frontend, потому что этот nginx является runtime для статического Vite build, а не production reverse proxy всего приложения.

Конфиг:

- слушает порт `80`;
- отдаёт `/usr/share/nginx/html`;
- делает SPA fallback на `index.html`;
- пишет JSON access logs с `service=frontend`.

Production reverse proxy для TLS, доменов и routing `/api` стоит добавлять отдельно в `deploy/nginx/`, когда он реально понадобится.

## CORS

Frontend не использует `mode: "no-cors"`. API Gateway и MinIO должны разрешать origin frontend на своей стороне.
