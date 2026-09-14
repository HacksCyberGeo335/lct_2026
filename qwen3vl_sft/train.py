"""Minimal EXP-01: Qwen3-VL SFT with an LLM-only LoRA adapter."""

import inspect
import os
from pathlib import Path

import mlflow
import torch
from datasets import Dataset
from peft import LoraConfig
from transformers import AutoProcessor, EarlyStoppingCallback, Qwen3VLForConditionalGeneration
from trl import SFTConfig, SFTTrainer

from dataset import assert_no_site_leakage, load_jsonl

MODEL_NAME = "Qwen/Qwen3-VL-2B-Instruct"
ROOT = Path(__file__).parent


def main() -> None:
    train = load_jsonl(ROOT / "data/train.jsonl", ROOT / "images")
    val = load_jsonl(ROOT / "data/val.jsonl", ROOT / "images")
    test = load_jsonl(ROOT / "data/test.jsonl", ROOT / "images")
    assert_no_site_leakage(("train", train), ("val", val), ("test", test))

    processor = AutoProcessor.from_pretrained(MODEL_NAME)
    model = Qwen3VLForConditionalGeneration.from_pretrained(
        MODEL_NAME,
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
    )
    # The general-purpose vision encoder stays frozen in the first experiment.
    for name, parameter in model.named_parameters():
        if any(part in name.lower() for part in ("visual", "vision")):
            parameter.requires_grad = False

    # The exclude pattern prevents same-named projections in visual modules from receiving LoRA.
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        exclude_modules=[r"(^|\.)(visual|vision)(\.|$)"],
    )

    config_kwargs = dict(
        output_dir=str(ROOT / "outputs"),
        num_train_epochs=3,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=2e-4,
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=100,
        save_strategy="steps",
        save_steps=100,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        max_length=None,  # Do not accidentally truncate visual tokens.
        report_to=["mlflow"],
        remove_unused_columns=False,
    )
    # assistant_only_loss is available only in newer TRL versions. Qwen's template
    # supports it in those versions; otherwise TRL's default conversational loss is used.
    if "assistant_only_loss" in inspect.signature(SFTConfig).parameters:
        config_kwargs["assistant_only_loss"] = True
    if "processing_class" not in inspect.signature(SFTTrainer).parameters:
        raise RuntimeError("This baseline requires a recent TRL with processing_class support")

    mlflow.set_experiment(os.getenv("MLFLOW_EXPERIMENT", "qwen3vl-construction-sft"))
    with mlflow.start_run() as run:
        mlflow.log_params({
            "model_name": MODEL_NAME, "learning_rate": 2e-4, "epochs": 3,
            "lora_r": 16, "lora_alpha": 32, "lora_dropout": 0.05,
            "train_samples": len(train), "val_samples": len(val), "test_samples": len(test),
        })
        trainer = SFTTrainer(
            model=model,
            args=SFTConfig(**config_kwargs),
            train_dataset=Dataset.from_list(train),
            eval_dataset=Dataset.from_list(val),
            processing_class=processor,
            peft_config=lora_config,
            callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
        )
        vision_parameters = [
            parameter for name, parameter in trainer.model.named_parameters()
            if any(part in name.lower() for part in ("visual", "vision"))
        ]
        assert vision_parameters and not any(parameter.requires_grad for parameter in vision_parameters), \
            "Vision parameters must remain frozen"
        trainable = sum(parameter.numel() for parameter in trainer.model.parameters() if parameter.requires_grad)
        total = sum(parameter.numel() for parameter in trainer.model.parameters())
        print(f"trainable parameters: {trainable:,}")
        print(f"all parameters: {total:,}")
        print(f"trainable %: {100 * trainable / total:.4f}")
        # SFT teaches the model to reproduce the assistant response; here that response is JSON.
        # Validation loss controls checkpoint selection and measures generalization.
        result = trainer.train()
        trainer.save_model()
        metrics = trainer.evaluate()
        mlflow.log_metrics({k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))})
        eval_losses = [item["eval_loss"] for item in trainer.state.log_history if "eval_loss" in item]
        last_train_loss = result.training_loss
        if last_train_loss is not None:
            mlflow.log_metric("last_train_loss", float(last_train_loss))
        if eval_losses:
            best_eval_loss, final_eval_loss = min(eval_losses), eval_losses[-1]
            mlflow.log_metrics({
                "best_eval_loss": float(best_eval_loss),
                "final_eval_loss": float(final_eval_loss),
                "generalization_gap": float(final_eval_loss - last_train_loss) if last_train_loss is not None else 0.0,
            })
        mlflow.set_tag("run_id", run.info.run_id)
    print(f"Saved best LoRA adapter to {ROOT / 'outputs'}")


if __name__ == "__main__":
    main()
