# Frontend загрузки видео

Минимальный React + TypeScript + Vite frontend для загрузки видео через API Gateway и прямой PUT в MinIO.

## Локальный запуск без Docker

```bash
npm install
npm run dev
```

По умолчанию Vite dev server доступен на:

```text
http://localhost:5173
```

## Production build

```bash
npm run build
```

## Docker

Из корня репозитория:

```bash
docker compose up --build
```

Frontend будет доступен по адресу:

```text
http://localhost:3000
```

## Environment

API Gateway задается через переменную Vite:

```env
VITE_API_BASE_URL=http://localhost:8080
```

Если переменная не задана, frontend использует относительные URL вида `/api/...`.

Frontend не содержит MinIO credentials. URL загрузки берется только из ответа `init-upload`.

## Upload flow

```text
POST /api/videos/init-upload
    ↓
PUT <upload_url>/<uuid>/<file_name> напрямую в MinIO
    ↓
POST /api/videos/<uuid>/upload-complete
```

Для работы из браузера API Gateway и MinIO должны разрешать origin frontend в CORS-настройках. Frontend не использует `no-cors` и не обходит browser security.
