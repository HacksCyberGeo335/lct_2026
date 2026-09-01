# Инструкция по проверке upload pipeline

Документ описывает ручную проверку цепочки:

```text
frontend -> api_gateway -> upload_service -> PostgreSQL -> MinIO -> upload_service -> PostgreSQL
```

Основные адреса локального окружения:

- Frontend: `http://localhost:3000`
- Grafana: `http://localhost:3001`
- API Gateway: `http://localhost:8080`
- Upload Service: `http://localhost:8081`
- MinIO S3 API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- PostgreSQL: `localhost:5432`

MinIO credentials:

- Login: `prom_app`
- Password: `prom_app_password`

Grafana credentials:

- Login: `admin`
- Password: `admin`

## 1. Поднять проект

Из корня репозитория:

```bash
docker compose up -d --build
```

Ожидаемый результат:

```text
Container prom_app_postgres Started
Container prom_app_s3_storage Started
Container prom_app_s3_init Exited
Container prom_app_upload_service Started
Container prom_app_api_gateway Started
Container prom_app_frontend Started
```

Проверить состояние контейнеров:

```bash
docker compose ps
```

Ожидаемо:

- `prom_app_postgres` в статусе `healthy`
- `prom_app_s3_storage` в статусе `Up`
- `prom_app_s3_init` в статусе `Exited (0)`
- `prom_app_upload_service` в статусе `Up`
- `prom_app_api_gateway` в статусе `Up`
- `prom_app_frontend` в статусе `Up`

Если нужно посмотреть логи:

```bash
docker compose logs -f api_gateway upload_service
```

## 2. Проверить health endpoints

Проверка API Gateway:

```bash
curl -i http://localhost:8080/health
```

Ожидаемый результат:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok"}
```

Проверка Grafana:

```bash
curl -i http://localhost:3001/api/health
```

Ожидаемый результат:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"database":"ok","version":"...","commit":"..."}
```

Проверка upload_service напрямую:

```bash
curl -i http://localhost:8081/health
```

Ожидаемый результат:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok"}
```

## 3. Создать тестовый файл

Для ручной проверки через `curl` создадим маленький файл:

```bash
printf 'test-video-bytes' > /tmp/original.mp4
ls -lh /tmp/original.mp4
```

Размер файла должен быть `16` байт.

## 4. Инициализировать загрузку через API Gateway

Запрос:

```bash
curl -i -X POST http://localhost:8080/api/videos/init-upload \
  -H 'Content-Type: application/json' \
  -d '{"file_name":"original.mp4","size":16}'
```

Ожидаемый результат:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "uuid": "4f65feb4-1b98-4199-8851-cfde0665fa64",
  "upload_url": "http://localhost:9000/video-originals-prom",
  "storage_key": "video-originals-prom/4f65feb4-1b98-4199-8851-cfde0665fa64/original.mp4"
}
```

`uuid` будет новым при каждом запросе.

Что произошло на этом этапе:

- `api_gateway` принял `POST /api/videos/init-upload`
- `api_gateway` проксировал запрос в `upload_service`
- `upload_service` создал UUID
- `upload_service` сделал `INSERT` в `general_video_table`
- статус видео стал `UPLOADING`
- backend вернул URL бакета MinIO и ключ будущего объекта

## 5. То же самое с сохранением переменных

Для следующих шагов удобнее сохранить ответ в переменные. Нужен `jq`.

```bash
INIT_RESPONSE=$(curl -fsS -X POST http://localhost:8080/api/videos/init-upload \
  -H 'Content-Type: application/json' \
  -d '{"file_name":"original.mp4","size":16}')

echo "$INIT_RESPONSE" | jq .

UUID=$(echo "$INIT_RESPONSE" | jq -r '.uuid')
UPLOAD_URL=$(echo "$INIT_RESPONSE" | jq -r '.upload_url')
STORAGE_KEY=$(echo "$INIT_RESPONSE" | jq -r '.storage_key')

echo "UUID=$UUID"
echo "UPLOAD_URL=$UPLOAD_URL"
echo "STORAGE_KEY=$STORAGE_KEY"
```

Ожидаемый пример:

```text
UUID=4f65feb4-1b98-4199-8851-cfde0665fa64
UPLOAD_URL=http://localhost:9000/video-originals-prom
STORAGE_KEY=video-originals-prom/4f65feb4-1b98-4199-8851-cfde0665fa64/original.mp4
```

Важно: имя файла при прямой загрузке должно совпасть с `file_name` из init-запроса. В текущей реализации backend проверяет именно путь, который сохранил в `storage_key`.

## 6. Проверить запись в PostgreSQL после init-upload

```bash
docker compose exec -T postgres psql -U prom_app -d prom_app \
  -c "SELECT uuid, video_name, storage_key, status, original_size_bytes, original_content_type, original_etag FROM general_video_table WHERE uuid = '$UUID';"
```

Ожидаемый результат:

```text
uuid                                  | video_name   | storage_key                                      | status    | original_size_bytes | original_content_type | original_etag
--------------------------------------+--------------+--------------------------------------------------+-----------+---------------------+-----------------------+--------------
4f65feb4-1b98-4199-8851-cfde0665fa64  | original.mp4 | video-originals-prom/.../original.mp4            | UPLOADING | 16                  |                       |
```

На этом этапе `original_content_type` и `original_etag` еще пустые, потому что файл еще не загружен в MinIO.

## 7. Загрузить файл напрямую в MinIO

Фронтенд делает это через `XMLHttpRequest PUT`. Ручной аналог через `curl`:

```bash
curl -i -X PUT "$UPLOAD_URL/$UUID/original.mp4" \
  -H 'Content-Type: video/mp4' \
  --data-binary '@/tmp/original.mp4'
```

Ожидаемый результат:

```http
HTTP/1.1 200 OK
Etag: "..."
```

Что произошло:

- файл загружен напрямую в MinIO
- объект появился в бакете `video-originals-prom`
- путь объекта внутри бакета: `$UUID/original.mp4`
- полный storage key: `video-originals-prom/$UUID/original.mp4`

## 8. Проверить файл в MinIO через HEAD

Публичная проверка снаружи Docker:

```bash
curl -I "$UPLOAD_URL/$UUID/original.mp4"
```

Ожидаемый результат:

```http
HTTP/1.1 200 OK
Content-Type: video/mp4
Content-Length: 16
Etag: "..."
```

Можно также открыть MinIO Console:

```text
http://localhost:9001
```

Дальше:

1. Войти как `prom_app` / `prom_app_password`
2. Открыть bucket `video-originals-prom`
3. Найти папку с UUID
4. Проверить файл `original.mp4`

## 9. Подтвердить завершение загрузки

Запрос через API Gateway:

```bash
curl -i -X POST "http://localhost:8080/api/videos/$UUID/upload-complete" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Ожидаемый результат:

```http
HTTP/1.1 200 OK
```

Что произошло на этом этапе:

- `api_gateway` принял `POST /api/videos/{uuid}/upload-complete`
- `api_gateway` проксировал запрос в `upload_service`
- `upload_service` прочитал запись из `general_video_table`
- `upload_service` выполнил `HEAD` в MinIO по сохраненному `storage_key`
- если MinIO вернул `200 OK`, backend обновил запись
- статус видео стал `READY`
- сохранились `original_size_bytes`, `original_content_type`, `original_etag`

## 10. Проверить финальный статус в PostgreSQL

```bash
docker compose exec -T postgres psql -U prom_app -d prom_app \
  -c "SELECT uuid, video_name, storage_key, status, original_size_bytes, original_content_type, original_etag IS NOT NULL AS has_etag FROM general_video_table WHERE uuid = '$UUID';"
```

Ожидаемый результат:

```text
uuid                                  | video_name   | storage_key                           | status | original_size_bytes | original_content_type | has_etag
--------------------------------------+--------------+---------------------------------------+--------+---------------------+-----------------------+----------
4f65feb4-1b98-4199-8851-cfde0665fa64  | original.mp4 | video-originals-prom/.../original.mp4 | READY  | 16                  | video/mp4             | t
```

## 11. Полный smoke test одной командой

Команда выполняет весь pipeline:

```bash
set -e

printf 'test-video-bytes' > /tmp/original.mp4

INIT_RESPONSE=$(curl -fsS -X POST http://localhost:8080/api/videos/init-upload \
  -H 'Content-Type: application/json' \
  -d '{"file_name":"original.mp4","size":16}')

UUID=$(echo "$INIT_RESPONSE" | jq -r '.uuid')
UPLOAD_URL=$(echo "$INIT_RESPONSE" | jq -r '.upload_url')

echo "$INIT_RESPONSE" | jq .

curl -fsS -X PUT "$UPLOAD_URL/$UUID/original.mp4" \
  -H 'Content-Type: video/mp4' \
  --data-binary '@/tmp/original.mp4' \
  -o /dev/null

curl -fsS -X POST "http://localhost:8080/api/videos/$UUID/upload-complete" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  -o /dev/null

docker compose exec -T postgres psql -U prom_app -d prom_app \
  -c "SELECT uuid, video_name, storage_key, status, original_size_bytes, original_content_type, original_etag IS NOT NULL AS has_etag FROM general_video_table WHERE uuid = '$UUID';"
```

Ожидаемо в конце:

```text
status | READY
original_size_bytes | 16
original_content_type | video/mp4
has_etag | t
```

## 12. Проверка через frontend

Открыть:

```text
http://localhost:3000
```

Дальше:

1. Выбрать видеофайл
2. Нажать `Загрузить видео`
3. Дождаться статуса `Видео успешно загружено`
4. Скопировать показанный UUID
5. Проверить запись:

```bash
docker compose exec -T postgres psql -U prom_app -d prom_app \
  -c "SELECT uuid, video_name, storage_key, status, original_size_bytes, original_content_type, original_etag IS NOT NULL AS has_etag FROM general_video_table ORDER BY created_at DESC LIMIT 5;"
```

Ожидаемо последняя запись будет со статусом `READY`.

## 13. Проверка логов в Grafana/Loki

Открыть Grafana:

```text
http://localhost:3001
```

Войти:

```text
admin / admin
```

Открыть dashboard:

```text
Prom App -> Prom App HTTP/API Logs
```

Dashboard показывает:

- `HTTP Requests By Status` - частота запросов по сервисам и HTTP-статусам
- `Latency P95` - 95-й перцентиль времени ответа
- `HTTP Error Rate` - доля 4xx/5xx
- `5xx Errors` - количество серверных ошибок
- `Recent HTTP Requests` - последние HTTP-запросы
- `HTTP Errors` - только HTTP-запросы со статусом 400+
- `Raw Service Logs` - сырые логи всех контейнеров проекта

Фильтры dashboard:

- `Service` - выбрать один или несколько сервисов
- `Endpoint regex` - фильтрация endpoint регулярным выражением, например `/api/videos/.*`
- `Raw log search` - текстовый поиск по сырым логам

Проверить Loki напрямую:

```bash
curl -fsS 'http://localhost:3100/loki/api/v1/label/service/values' | jq .
```

Ожидаемый пример:

```json
{
  "status": "success",
  "data": [
    "api_gateway",
    "frontend",
    "upload_service"
  ]
}
```

Проверить последние HTTP access logs через Loki API:

```bash
curl -fsS --get 'http://localhost:3100/loki/api/v1/query_range' \
  --data-urlencode 'query={service=~"api_gateway|upload_service|frontend"} | json | log_type="http_access" | line_format "{{.service}} {{.method}} {{.endpoint}} status={{.status}} duration_s={{.duration_seconds}} error={{.error}}"' \
  --data-urlencode 'limit=20' \
  | jq -r '.data.result[].values[][1]'
```

Ожидаемый пример:

```text
upload_service POST /api/videos/init-upload status=400 duration_s=0.000019625 error=file_name is required
upload_service POST /api/videos/init-upload status=200 duration_s=0.001432958 error=
frontend GET /index.html status=200 duration_s=0.000 error=
api_gateway POST /api/videos/init-upload status=400 duration_s=0.000195417 error=file_name is required
api_gateway POST /api/videos/init-upload status=200 duration_s=0.002288167 error=
api_gateway GET /health status=200 duration_s=0.000024541 error=
```

HTTP access logs в JSON сейчас пишут:

- `api_gateway`
- `upload_service`
- `frontend`

Остальные контейнеры тоже собираются в Loki, но как raw logs:

- `postgres`
- `redis`
- `s3-storage`
- `s3_init`
- `loki`
- `alloy`
- `grafana`

## 14. Негативные проверки

### Init без имени файла

```bash
curl -i -X POST http://localhost:8080/api/videos/init-upload \
  -H 'Content-Type: application/json' \
  -d '{"file_name":"","size":16}'
```

Ожидаемо:

```http
HTTP/1.1 400 Bad Request

file_name is required
```

### Init с нулевым размером

```bash
curl -i -X POST http://localhost:8080/api/videos/init-upload \
  -H 'Content-Type: application/json' \
  -d '{"file_name":"original.mp4","size":0}'
```

Ожидаемо:

```http
HTTP/1.1 400 Bad Request

size must be greater than zero
```

### Complete до загрузки файла в MinIO

```bash
INIT_RESPONSE=$(curl -fsS -X POST http://localhost:8080/api/videos/init-upload \
  -H 'Content-Type: application/json' \
  -d '{"file_name":"missing.mp4","size":16}')

UUID=$(echo "$INIT_RESPONSE" | jq -r '.uuid')

curl -i -X POST "http://localhost:8080/api/videos/$UUID/upload-complete" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Ожидаемо:

```http
HTTP/1.1 404 Not Found

uploaded file not found in storage
```

### Complete по несуществующему UUID

```bash
curl -i -X POST http://localhost:8080/api/videos/00000000-0000-4000-8000-000000000000/upload-complete \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Ожидаемо:

```http
HTTP/1.1 404 Not Found

video not found
```

## 15. Остановить проект

Остановить контейнеры, сохранив данные PostgreSQL и MinIO:

```bash
docker compose down
```

Остановить и удалить volumes с данными:

```bash
docker compose down -v
```

`docker compose down -v` удалит таблицы PostgreSQL и загруженные файлы MinIO.

## 16. Частые проблемы

### `curl: Failed to connect to localhost port 8080`

Проверить, что gateway поднят:

```bash
docker compose ps api_gateway
docker compose logs --tail=100 api_gateway
```

### `uploaded file not found in storage`

Обычно это значит, что файл был загружен не по тому ключу.

Проверьте, что PUT выполнялся именно сюда:

```bash
curl -I "$UPLOAD_URL/$UUID/original.mp4"
```

Имя файла должно совпадать с `file_name`, который был передан в `init-upload`.

### В браузере ошибка CORS при PUT в MinIO

В текущем local-compose bucket `video-originals-prom` открыт публично через:

```bash
mc anonymous set public local/video-originals-prom
```

Если volume MinIO был создан до этой настройки, перезапустите инициализацию:

```bash
docker compose up s3_init
```

или пересоздайте volumes:

```bash
docker compose down -v
docker compose up -d --build
```

### Таблица есть, но нет колонок `original_*`

`upload_service` добавляет эти колонки при старте. Перезапустите сервис:

```bash
docker compose restart upload_service
```

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
