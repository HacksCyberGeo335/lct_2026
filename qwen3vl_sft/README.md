# Qwen3-VL SFT baseline для строительных площадок

Минимальный baseline для `Qwen/Qwen3-VL-2B-Instruct`: supervised fine-tuning через `trl.SFTTrainer` и LoRA через PEFT. На вход подаются изображение и инструкция, ответом является JSON по схеме разметки.

`dataset.py` читает JSONL, проверяет существование изображения и строит `messages`. Поле `target` остаётся единственным источником ground truth: assistant message получает `json.dumps(target, ensure_ascii=False)`. Демо-файлы содержат маленькие PPM-изображения с расширением `.jpg`, чтобы пример запускался без внешних бинарных ассетов; для реального эксперимента замените их настоящими кадрами.

## Данные

Каждая строка `data/train.jsonl`, `data/val.jsonl` или `data/test.jsonl` описывает одно изображение:

```json
{"id":"site_001_frame_000001","site_id":"site_001","image":"site_001/frame_000001.jpg","instruction":"Проанализируй изображение и верни только JSON.","target":{"scene":"земляные работы","stage":"подготовка котлована","structures":[],"equipment":[{"type":"экскаватор","location":"центр"}],"workers":{"count_visible":1},"ppe":{"helmets":true,"visibility_vests":null},"hazards":[],"uncertain":["Жилет неразличим."]}}
```

`site_id` не может повторяться между split: `assert_no_site_leakage` останавливает запуск при утечке соседних кадров. Train используется для gradient updates, validation — для `eval_loss`, early stopping и выбора лучшего checkpoint. Test загружается только отдельным `evaluate.py` и не влияет на checkpoint или hyperparameters.

SFT — это objective обучения: модель учится воспроизводить ground-truth assistant response, которым здесь является JSON. LoRA/PEFT — способ ограничить изменяемые параметры во время этого SFT. В EXP-01 адаптеры применяются к `q_proj`, `k_proj`, `v_proj`, `o_proj` LLM, а vision encoder заморожен: базовая модель уже содержит общее визуальное представление, и так проще измерить эффект адаптации языка и формата.

## Установка и запуск

```bash
cd qwen3vl_sft
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mlflow server --host 127.0.0.1 --port 5000
```

В другом терминале:

```bash
export MLFLOW_TRACKING_URI=http://127.0.0.1:5000
python train.py
python evaluate.py                 # base model, первые 20 test samples
python evaluate.py --checkpoint outputs
```

Trainer через `report_to=["mlflow"]` логирует train loss, eval loss, learning rate, epoch и step (а также `grad_norm`, если это делает установленная версия Trainer). Скрипты дополнительно записывают параметры run и таблицу prediction-vs-ground-truth. Если версия MLflow не поддерживает `log_table`, замените одну строку в `evaluate.py` на `mlflow.log_artifact` для уже созданного CSV.

`evaluate.py` использует `model.generate(..., do_sample=False)`, сохраняет `id`, `site_id`, image, instruction, ground truth, raw prediction и parsed prediction. Метрики: `json_valid`, exact match для scene/stage, precision/recall/F1 по нормализованным `type` в structures/equipment, `ppe_accuracy` и `workers_count_mae`.

## Интерпретация и следующие эксперименты

Смотрите `last_train_loss`, `best_eval_loss`, `final_eval_loss` и `generalization_gap = final_eval_loss - last_train_loss`. Возможный overfitting: train loss снижается, eval loss перестаёт снижаться или растёт, gap увеличивается. Возможный underfitting: оба loss остаются высокими, а generation metrics плохие. Эти признаки не превращаются в произвольный автоматический threshold.

Порядок экспериментов:

```text
EXP-00  Base Qwen3-VL-2B-Instruct
EXP-01  SFT + LoRA q/k/v/o, r=16, vision frozen   (этот baseline)
EXP-02  SFT + LoRA q/k/v/o, r=32, vision frozen
EXP-03  LoRA attention + MLP, vision frozen
EXP-04  LLM LoRA + multimodal/projector tuning
EXP-05  LLM LoRA + vision adaptation
```
