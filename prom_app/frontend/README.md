# Стройконтроль · frontend

Рабочая версия использует существующие Gateway и Upload Service. Backend сейчас
поддерживает проверку доступности Gateway и загрузку видео в MinIO с подтверждением
в PostgreSQL. Реестра объектов, камер, календарных планов и анализа пока нет.

Актуальный отчёт: [INTEGRATION_REPORT.md](INTEGRATION_REPORT.md).
Предыдущие REVIEW/NEW_TZ/FRONTEND_REVIEW и документы в `docs/` описывают прежние этапы проекта.

## Main и demo

- `main`: режим API по умолчанию и в разработке, и в production. Нет демофотографий,
  готовых результатов, искусственных объектов и переключателя демо. `?mode=demo`
  не включает демо; `VITE_APP_MODE=demo` вызывает понятную ошибку конфигурации.
- `demo`: тот же рабочий код плюс `src/demo/entry.ts`, данные, демонстрационные страницы
  и public-материалы. В dev демо выбирается по умолчанию, если `VITE_APP_MODE` не задан.
  В production демо открывается явно через `?mode=demo` или переключатель.
- `src/app/demoExtension.ts` — общий контракт дополнения. Наличие файла дополнения
  определяется при сборке. Одной переменной окружения нельзя вернуть демо в `main`.
- Общую логику меняйте в `main`, затем переносите изменения в `demo` слиянием `main → demo`.
  Не сливайте демонстрационные дополнения обратно в `main`.

Изменения оформлены отдельными коммитами: рабочая версия в `main`, демонстрационное
дополнение поверх неё в `demo`. Коммиты локальные; публикация выполняется отдельно.

## Запуск рабочей версии в Windows / PowerShell

Нужен Node.js 20.19+ или 22.12+ и npm. Docker Desktop нужен только для backend-стека.

Из корня репозитория поднимите существующие сервисы:

```powershell
docker compose up -d --build postgres s3-storage s3_init upload_service api_gateway
```

Запустите frontend:

```powershell
cd prom_app/frontend
npm.cmd ci
npm.cmd run dev
```

Откройте `http://127.0.0.1:5173/objects`. Без backend интерфейс запустится и покажет
ошибку подключения. Это не демонстрационный режим и не успешная загрузка.

По умолчанию Vite проксирует `/api` и `/health` на `http://127.0.0.1:8080`.
Для других адресов создайте `.env.local` по примеру `.env.example`:

```dotenv
VITE_APP_MODE=api
VITE_API_BASE_URL=/api
API_PROXY_TARGET=http://127.0.0.1:8080
```

Если в старом `.env`/`.env.local` стоит `VITE_APP_MODE=demo`, замените его на `api`
для рабочей ветки. После изменения переменных перезапустите Vite.

Полный существующий Compose с nginx-frontend:

```powershell
# Из корня репозитория
docker compose up -d --build postgres s3-storage s3_init upload_service api_gateway frontend
```

Frontend будет на `http://localhost:3000` при стандартных переменных. Compose передаёт
`VITE_API_BASE_URL=/api`; nginx проксирует запросы в Gateway.
`MINIO_PUBLIC_ENDPOINT` в корневом `.env` должен быть доступен именно браузеру.
Для другой машины `localhost:9000` обычно не подходит: задайте публичный адрес MinIO.

## Что можно проверить

1. Нажмите «Проверить подключение». Успешный `/health` подтверждает доступность только Gateway.
2. «Загрузить запись» → выберите MP4/WebM/MOV → «Загрузить видео».
3. Дождитесь READY и UUID. Порядок: `init-upload`, PUT файла, `upload-complete`.
4. «Перейти к записи» открывает видео из MinIO. Ошибка просмотра не отменяет READY;
   «Повторить просмотр» не загружает файл повторно.
5. При ошибке подтверждения «Повторить подтверждение» повторяет только последний POST.
   Список загруженных записей существует только до перезагрузки: API списка отсутствует.
6. В «Снимки и отклонения» можно локально открыть свои PNG/JPEG/WebP, импортировать
   имеющийся JSON результата, выбрать работу и условия. Фронт не отправляет снимки
   на сервер и не запускает ML. Формат: [ANALYSIS_CONTRACT.md](ANALYSIS_CONTRACT.md).
7. CSV в проверке снимков задаёт локальный план сеанса. Предпросмотр плана в календаре
   не сохраняет его на сервер: соответствующий API пока отсутствует.

Справочник в `public/catalog` — поставленные справочные данные проекта, не fake-результаты
анализа. Копии синтетических файлов в `tests/fixtures` используются только тестами,
не попадают в `dist` и не раздаются по `/tests/` в dev/preview.

## Проверки

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
node tools/verify-preview.mjs
```

На 27.09.2026: `main` — 63 unit/integration и 7 E2E; `demo` — 73 unit/integration,
54 E2E, один main-only тест намеренно пропущен. Lint, TypeScript, build и preview
прошли в обоих checkout. API-ответы в обычных E2E подменяются только внутри тестов.

Отдельная проверка живого стека, **без подмены запросов**, при уже запущенных сервисах:

```powershell
$env:FRONTEND_URL='http://127.0.0.1:5173'
node tools/verify-live.mjs 'C:/path/to/video.mp4'
```

Эта команда реально загружает файл. Сохраните выведенный UUID: API удаления нет.
В текущем окружении live-check остановился на HTTP 502 от `/health`; полная загрузка
через живые PostgreSQL/MinIO не подтверждена. Docker и Go здесь не установлены.

## Открыть подготовленный demo-checkout

```powershell
cd 'C:/Users/Bokepon/Documents/ChatGPT/ЛЦТ КОДИНГ/lct_2026-demo/prom_app/frontend'
npm.cmd ci
npm.cmd run dev
```

Откройте `http://127.0.0.1:5173/objects?mode=demo`. Перед запуском остановите другой
Vite на 5173. Для проверки production выполняйте `npm.cmd run build` и
`npm.cmd run preview`, затем откройте `http://127.0.0.1:4173/objects?mode=demo`.
