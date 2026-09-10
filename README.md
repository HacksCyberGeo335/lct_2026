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

TODO:
* поддержка других видео файлов

 Да, поднимать всё одним Compose-проектом логично, пока приложение работает на одном сервере. Triton этому не мешает. Независимость микросервисов определяется их ответственностью,
  API и возможностью отдельно обновляться — количество Compose-файлов здесь вторично.

  Для тебя я бы оставил один Compose-проект, но вынес GPU-компоненты в дополнительный docker-compose.gpu.yml. Так обычный backend можно запускать на ноутбуке, а полный стек — на
  сервере с GPU.

  Куда поставить Triton в архитектуре

  Я бы добавил два компонента:

   Компонент       Ответственность                                                                                                                                                     
  ━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   video_worker    Получить задачу, прочитать видео, извлечь кадры, подготовить вход модели, обработать предсказания, сохранить результат
  ──────────────  ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   triton          Загрузить модели и выполнять inference над переданными тензорами

  Браузер → Gateway → Upload service → PostgreSQL
      │                      │
      └── загрузка → MinIO    └── задача обработки → очередь
                                                        │
                                                   video_worker
                                                    │    │    │
                             чтение видео из MinIO ←┘    │    └→ результаты
                                                         ↓       в MinIO/БД
                                                       Triton
                                                         ↓
                                                        GPU

  Triton не должен становиться сервисом управления видео. В предложенной схеме он ничего не знает о пользователях, статусах загрузки и заданиях. Этим занимается приложение.

  Для YOLO worker, например, выполняет декодирование видео, resize/letterbox и нормализацию; Triton исполняет модель; worker восстанавливает координаты, выполняет необходимую
  постобработку и трекинг. Точный состав зависит от того, что уже включено в экспортированную модель.

  Текущий upload-complete должен быстро подтверждать загрузку. Длительную обработку следует запускать асинхронно. При этом существующий статус READY означает готовность загруженного
  файла — состояние обработки лучше хранить отдельно: QUEUED → RUNNING → SUCCEEDED/FAILED.

  Для начала можно сделать очередь заданий в PostgreSQL с захватом задач, повторными попытками и восстановлением после сбоя worker. Если использовать имеющийся Redis, понадобится
  полноценная схема подтверждения и повторной доставки; обычный Pub/Sub для этого не подходит.

  Как дополнить твою структуру

  Переносить весь репозиторий сейчас необязательно:

  .
  ├── docker-compose.yml
  ├── docker-compose.gpu.yml             # Triton + video_worker
  ├── .env.example
  ├── infra
  │   ├── triton
  │   │   ├── README.md
  │   │   └── model_repository
  │   │       └── detector
  │   │           ├── config.pbtxt
  │   │           └── 1
  │   │               └── model.onnx    # артефакт, не обычный Git-файл
  │   ├── grafana
  │   ├── minio
  │   ├── postgres
  │   └── redis
  ├── prom_app
  │   ├── frontend
  │   └── services
  │       ├── api_gateway
  │       ├── upload_service
  │       └── video_worker
  │           ├── Dockerfile
  │           ├── pyproject.toml
  │           ├── src
  │           │   └── video_worker
  │           │       ├── main.py
  │           │       ├── jobs.py
  │           │       ├── storage.py
  │           │       ├── decoding.py
  │           │       ├── preprocessing.py
  │           │       ├── triton_client.py
  │           │       └── postprocessing.py
  │           └── tests
  ├── docs
  │   └── INFERENCE.md
  └── rnd
      ├── notebooks
      └── ...

  В infra/triton находится конфигурация обслуживания моделей, в video_worker — прикладная логика обработки. rnd остаётся местом экспериментов; для запуска используется явно
  подготовленный и версионированный артефакт.

  Структура имя_модели/номер_версии/model.onnx соответствует формату Triton model repository. config.pbtxt задаёт backend, входы, выходы, размещение модели и настройки batching. Эти
  параметры нужно подбирать под конкретный экспорт. Документация NVIDIA
  (https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/model_repository.html).

  Пример подключения через Compose

  Начальный фрагмент docker-compose.gpu.yml для Linux-сервера с NVIDIA GPU:

  services:
    triton:
      image: ${TRITON_IMAGE:?Set a pinned Triton image}
      command:
        - tritonserver
        - --model-repository=/models
        - --model-control-mode=explicit
        - --load-model=detector
        - --strict-readiness=true
      volumes:
        - ./infra/triton/model_repository:/models:ro
      shm_size: "1gb"
      restart: unless-stopped
      deploy:
        resources:
          reservations:
            devices:
              - driver: nvidia
                count: 1
                capabilities: [gpu]

  В .env понадобится закреплённый тег образа вида nvcr.io/nvidia/tritonserver:<версия>-py3, выбранный с учётом драйвера и backend модели. Доступ к GPU требует установленного драйвера
  и настроенного NVIDIA Container Toolkit. Такой способ назначения GPU поддерживается Compose. Документация Docker (https://docs.docker.com/compose/how-tos/gpu-support/).

  Публиковать порты Triton на хост для worker не требуется: при объединении файлов он будет доступен в сети текущего проекта:

  triton:8000   HTTP
  triton:8001   gRPC
  triton:8002   метрики

  Worker получает, например:

  environment:
    TRITON_GRPC_URL: triton:8001
    TRITON_MODEL_NAME: detector
    TRITON_MODEL_VERSION: "1"

  Сам video_worker нужно будет реализовать и добавить в этот же дополнительный файл. На старте он должен проверять готовность конкретной модели, а при временной недоступности Triton
  повторять запросы с ограничениями.

  Обычный запуск остаётся прежним:

  docker compose up -d

  Запуск с GPU-компонентами после их подготовки:

  docker compose \
    -f docker-compose.yml \
    -f docker-compose.gpu.yml \
    up -d

  Эти команды показывают будущий способ запуска: сейчас дополнительного файла, worker и подготовленной модели в проекте нет.

  Когда лучше разделить развёртывание

  Если GPU находится на другой машине, разумно сделать два Compose-проекта:

  Сервер приложения               GPU-сервер
  ─────────────────               ──────────
  frontend                        video_worker
  api_gateway                     triton
  upload_service
  PostgreSQL
  MinIO
  очередь

  Worker рядом с Triton читает видео из MinIO и передаёт тензоры локально — большие массивы кадров не приходится гонять между серверами. Между машинами потребуются защищённое сетевое
  соединение и реальные адреса: Compose-имя triton само по себе между хостами не работает.

  Для твоего Mac я бы использовал удалённый GPU-сервер. NVIDIA GPU-вариант нельзя перенести в Docker Desktop на macOS простым добавлением capabilities: [gpu]; документированная
  GPU-поддержка Docker Desktop относится к Windows/WSL2. Документация Docker (https://docs.docker.com/desktop/features/gpu/).

  Моя рекомендация: сейчас сохранить текущий Compose, добавить отдельный GPU-файл и video_worker; разделять проекты по машинам, когда появится отдельный GPU-хост.

─ Worked for 1m 19s ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

                                                                                                                                                                                       
› а если я хочу для теста использовать только CPU но всё на маке ?                                                                                                                     
                                                                                                                                                                                       

• Проверю CPU-режим Triton и ограничения на Mac, особенно для Apple Silicon.

• Searching the web

• Searched the web for https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/backend/docs/backend_platform_support_matrix.html

• Ran uname -m
  └ arm64

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Да, для функциональных тестов можно оставить весь стек на Mac и запускать Triton на CPU. Моя предыдущая рекомендация удалённого сервера относилась к NVIDIA GPU.

  Проверил: у тебя arm64. Здесь нужно различать две вещи:

  - CPU inference поддерживается: например, ONNX Runtime backend работает на CPU, включая Linux ARM.
  - Совместимость конкретного образа с Docker Desktop на Apple Silicon нужно проверить запуском. Поддержка NVIDIA ARM-SBSA сама по себе не гарантирует работу на Mac. TensorRT-модель
    на CPU не заработает — для этого варианта используй ONNX. Матрица NVIDIA
    (https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/backend/docs/backend_platform_support_matrix.html).

  Архитектура останется той же:

  Docker Desktop на Mac
    frontend → gateway → upload → PostgreSQL / MinIO
                                      ↓
                                 video_worker
                                      ↓ gRPC
                                Triton → CPU

  Я бы добавил docker-compose.cpu.yml рядом с основным Compose. Пример заготовки:

  services:
    triton:
      image: ${TRITON_IMAGE:?Set a tested Triton image}
      command:
        - tritonserver
        - --model-repository=/models
        - --model-control-mode=explicit
        - --load-model=detector
        - --strict-readiness=true
      volumes:
        - ./infra/triton/model_repository:/models:ro
      ports:
        - "127.0.0.1:8000:8000" # локальная проверка HTTP API
      shm_size: "1gb"
      cpus: 4
      mem_limit: 8g

  Здесь нет GPU reservation и NVIDIA runtime. Значения CPU/RAM — пример стартовых лимитов; их нужно согласовать с памятью Mac и ресурсами, выделенными Docker Desktop.

  В infra/triton/model_repository/detector/config.pbtxt явно задаётся CPU:

  name: "detector"
  backend: "onnxruntime"

  instance_group [
    {
      kind: KIND_CPU
      count: 1
    }
  ]

  Это фрагмент конфигурации: входы, выходы и batching нужно определить по твоему ONNX-файлу либо проверить автоматически определённую Triton конфигурацию. KIND_CPU закрепляет
  выполнение модели на CPU. Конфигурация моделей NVIDIA (https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/model_configuration.html).

  Модель размещается здесь:

  infra/triton/model_repository/
  └── detector/
      ├── config.pbtxt
      └── 1/
          └── model.onnx

  После подготовки образа и модели:

  docker compose \
    -f docker-compose.yml \
    -f docker-compose.cpu.yml \
    up -d

  Worker внутри проекта обращается к triton:8001. С Mac готовность модели проверяется так:

  curl --fail http://localhost:8000/v2/models/detector/ready

  Для Apple Silicon сначала стоит проверить ARM64-вариант выбранного образа. Если подходящего нет, можно пробовать platform: linux/amd64 через эмуляцию, но это может быть медленно и
  столкнуться с несовместимыми CPU-инструкциями. Я пока не запускал Triton на твоём Mac, поэтому не называю эту заготовку проверенной конфигурацией.

  Для начала я бы использовал небольшую ONNX-модель, одну выполняющуюся задачу и короткое видео с выборкой кадров. Такой стенд позволит проверить загрузку, очередь, вызов Triton и
  сохранение результатов. Производительность GPU-сервера по этим замерам оценивать нельзя.
  



а где должны находиться асинхронные и синхронные клиенты, через которые условно мы будем работать ?                                                                                  
                                                                                                                                                                                       

• Клиенты должны находиться в сервисе, который вызывает соответствующую зависимость. Например, клиент Triton — внутри video_worker, потому что именно worker отправляет модели данные.

  Синхронный и асинхронный клиент — это способы выполнения запросов. Они не требуют отдельных микросервисов или контейнеров.

  Для твоего проекта я бы организовал так:

  prom_app/
  ├── frontend/
  │   └── src/api/
  │       └── videoApi.ts             # браузерный клиент твоего API
  │
  └── services/
      ├── api_gateway/
      │   └── internal/
      │       └── router/            # проксирование в upload_service
      │
      ├── upload_service/
      │   └── internal/
      │       ├── storage/           # клиент MinIO
      │       └── repository/        # работа с PostgreSQL
      │
      └── video_worker/
          ├── pyproject.toml
          ├── src/
          │   └── video_worker/
          │       ├── main.py        # создание клиентов, запуск и завершение
          │       ├── config.py      # адреса, таймауты, имя/версия модели
          │       ├── clients/
          │       │   ├── triton.py  # клиент inference
          │       │   └── storage.py # клиент MinIO
          │       ├── repositories/
          │       │   └── jobs.py    # задания и результаты в БД
          │       └── pipeline/
          │           ├── video.py
          │           ├── preprocessing.py
          │           └── postprocessing.py
          └── tests/

  Разделение ответственности здесь такое:

   Слой                    Что делает                                                                                                                                                  
  ━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   clients/triton.py       Преобразует вызов в запрос Triton, задаёт timeout, получает ответ, обрабатывает транспортные ошибки
  ──────────────────────  ─────────────────────────────────────────────────────────────────────────────────────────────────────
   pipeline/               Решает, какие кадры обработать, готовит данные, интерпретирует предсказания
  ──────────────────────  ─────────────────────────────────────────────────────────────────────────────────────────────────────
   repositories/jobs.py    Забирает задания и сохраняет их состояние
  ──────────────────────  ─────────────────────────────────────────────────────────────────────────────────────────────────────
   main.py                 Создаёт клиенты и передаёт их в обработчик заданий; закрывает соединения при завершении

  Клиент не должен самостоятельно менять статус задания в БД или решать, когда повторять обработку всего видео. Эти решения принадлежат обработчику задания.

  Нужны ли одновременно sync и async?

  Для первого CPU-стенда с одним обрабатываемым видео я бы начал с синхронного клиента Triton. Он проще для отладки. При этом обработка видео останется асинхронной относительно HTTP
  API:

  HTTP API → сохранить задание → быстро вернуть ответ
                      ↓
               отдельный worker
                      ↓
            синхронный вызов Triton

  Здесь нет противоречия: фоновая обработка задания и неблокирующий сетевой клиент — разные вещи.

  Асинхронный клиент пригодится, когда worker должен одновременно ожидать несколько запросов inference или операций ввода-вывода. Число запросов нужно ограничивать, особенно на CPU.
  Сам по себе async не ускоряет вычисление модели или декодирование видео.

  Если появится реальная потребность в обоих вариантах, можно расширить каталог:

  clients/
  └── triton/
      ├── types.py       # общие типы запросов и результатов
      ├── sync_client.py
      └── async_client.py

  Создавать обе реализации заранее я бы не стал. Клиент обычно создаётся при старте worker и используется повторно, а не заново для каждого кадра.

  В infra/triton/ оставь конфигурацию сервера и model repository. Прикладной клиент находится в video_worker. Если позднее Triton будут вызывать несколько Python-сервисов и им
  понадобится одинаковая обёртка, её можно выделить в версионируемый пакет packages/inference_client/. Пока потребитель один, локальный модуль внутри worker будет проще.