"""Small, transparent task metrics for the construction-site JSON schema."""

import json
from collections.abc import Iterable


def parse_prediction(text: str) -> dict | None:
    try:
        value = json.loads(text.strip())
        return value if isinstance(value, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def _types(items: Iterable[dict]) -> set[str]:
    return {str(item["type"]).strip().lower() for item in items if item.get("type")}


def _set_scores(expected: Iterable[dict], predicted: Iterable[dict]) -> tuple[float, float, float]:
    truth, guess = _types(expected), _types(predicted)
    tp = len(truth & guess)
    precision = tp / len(guess) if guess else (1.0 if not truth else 0.0)
    recall = tp / len(truth) if truth else (1.0 if not guess else 0.0)
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1


def score_record(target: dict, prediction_text: str) -> dict:
    prediction = parse_prediction(prediction_text)
    result = {"json_valid": int(prediction is not None)}
    prediction = prediction or {}
    result["scene_exact"] = int(prediction.get("scene") == target.get("scene"))
    result["stage_exact"] = int(prediction.get("stage") == target.get("stage"))
    for field in ("structures", "equipment"):
        p, r, f1 = _set_scores(target.get(field, []), prediction.get(field, []))
        result[f"{field}_precision"] = p
        result[f"{field}_recall"] = r
        result[f"{field}_f1"] = f1
    truth_ppe, guess_ppe = target.get("ppe", {}), prediction.get("ppe", {})
    ppe_fields = ("helmets", "visibility_vests")
    result["ppe_accuracy"] = sum(
        truth_ppe.get(key) == guess_ppe.get(key) for key in ppe_fields
    ) / len(ppe_fields)
    true_count = target.get("workers", {}).get("count_visible")
    predicted_count = prediction.get("workers", {}).get("count_visible")
    result["workers_count_abs_error"] = (
        abs(predicted_count - true_count)
        if isinstance(true_count, (int, float)) and isinstance(predicted_count, (int, float))
        else None
    )
    return result


def aggregate(records: list[dict]) -> dict:
    numeric = [key for key in records[0] if key != "workers_count_abs_error"] if records else []
    output = {key: sum(row[key] for row in records) / len(records) for key in numeric}
    errors = [row["workers_count_abs_error"] for row in records if row["workers_count_abs_error"] is not None]
    output["workers_count_mae"] = sum(errors) / len(errors) if errors else None
    return output

