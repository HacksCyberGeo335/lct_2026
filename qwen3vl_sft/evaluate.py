"""Deterministic generation evaluation for the base model or a saved LoRA adapter."""

import argparse
import json
import os
from pathlib import Path

import mlflow
import pandas as pd
import torch
from peft import PeftModel
from transformers import AutoProcessor, Qwen3VLForConditionalGeneration

from dataset import load_jsonl
from metrics import aggregate, parse_prediction, score_record

MODEL_NAME = "Qwen/Qwen3-VL-2B-Instruct"
ROOT = Path(__file__).parent


def generate(model, processor, row: dict) -> str:
    messages = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": row["instruction"]}]}]
    prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = processor(text=[prompt], images=[row["image"]], return_tensors="pt", padding=True)
    inputs = {key: value.to(model.device) if hasattr(value, "to") else value for key, value in inputs.items()}
    with torch.inference_mode():
        output = model.generate(**inputs, max_new_tokens=512, do_sample=False)
    generated = output[:, inputs["input_ids"].shape[1]:]
    return processor.batch_decode(generated, skip_special_tokens=True)[0].strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", help="LoRA adapter directory; omit for the base model")
    parser.add_argument("--limit", type=int, default=20, help="Number of test samples (default: 20)")
    args = parser.parse_args()
    rows = load_jsonl(ROOT / "data/test.jsonl", ROOT / "images")[: args.limit]
    # An adapter directory may not contain processor files, so use the base processor.
    processor = AutoProcessor.from_pretrained(MODEL_NAME)
    base = Qwen3VLForConditionalGeneration.from_pretrained(
        MODEL_NAME, torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32
    )
    model = PeftModel.from_pretrained(base, args.checkpoint) if args.checkpoint else base
    model.eval()
    records = []
    for row in rows:
        prediction = generate(model, processor, row)
        scores = score_record(row["target"], prediction)
        records.append({
            "id": row["id"], "site_id": row["site_id"], "image": row["image_path"],
            "instruction": row["instruction"],
            "ground_truth": json.dumps(row["target"], ensure_ascii=False), "prediction": prediction, **scores,
            "parsed_prediction": json.dumps(parse_prediction(prediction), ensure_ascii=False),
        })
    frame = pd.DataFrame(records)
    summary = aggregate([{key: value for key, value in item.items() if key in scores} for item in records])
    prefix = "finetuned_test" if args.checkpoint else "base_test"
    mlflow.set_experiment(os.getenv("MLFLOW_EXPERIMENT", "qwen3vl-construction-sft"))
    with mlflow.start_run(run_name=prefix):
        mlflow.log_metrics({f"{prefix}/{key}": float(value) for key, value in summary.items() if value is not None})
        frame.to_csv(ROOT / f"{prefix}_predictions.csv", index=False)
        mlflow.log_artifact(str(ROOT / f"{prefix}_predictions.csv"))
        if hasattr(mlflow, "log_table"):
            mlflow.log_table(frame, artifact_file=f"{prefix}_predictions.json")
    print(json.dumps({prefix: summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
