# Postgres

Локальный PostgreSQL для `prom_app`.

## Состав

- `Dockerfile` - образ на базе `postgres:16-alpine`.
- `initdb/001_video_tables.sql` - первичная схема таблиц для видео.

Init-скрипты выполняются PostgreSQL entrypoint только при первом создании data volume.

## Доступы по умолчанию

```text
Host:     localhost
Port:     5432
Database: prom_app
User:     prom_app
Password: prom_app_password
```

Для сервисов внутри compose:

```text
postgres://prom_app:prom_app_password@postgres:5432/prom_app
```

## Команды для проверки таблиц

```bash
retro0@marinas lct_2026 % docker compose exec postgres psql -U prom_app -d prom_app -c "SELECT 1 AS db_is_alive;"
 db_is_alive 
-------------
           1
(1 row)

retro0@marinas lct_2026 % docker compose exec postgres psql -U prom_app -d prom_app -c "SELECT * from general_video_table"
 uuid | video_name | storage_key | status | created_at | updated_at 
------+------------+-------------+--------+------------+------------
(0 rows)

retro0@marinas lct_2026 % docker compose exec postgres psql -U prom_app -d prom_app -c "SELECT * from meta_video_table"
 uuid | width | height | fps | duration_ms | video_codec | audio_codec | bitrate 
------+-------+--------+-----+-------------+-------------+-------------+---------
(0 rows)

```
