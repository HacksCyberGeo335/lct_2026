"""Load JSONL annotations and build the conversational dataset used by TRL."""

import json
from pathlib import Path

from PIL import Image


def load_jsonl(path: str | Path, images_dir: str | Path) -> list[dict]:
    """Read annotations and attach each image as a PIL image."""
    path = Path(path)
    images_dir = Path(images_dir)
    rows = []
    with path.open(encoding="utf-8") as file:
        for line_number, line in enumerate(file, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            image_path = images_dir / row["image"]
            if not image_path.exists():
                raise FileNotFoundError(f"{path}:{line_number}: image not found: {image_path}")
            row["image_path"] = row["image"]
            with Image.open(image_path) as image:
                image = image.convert("RGB")
                row["image"] = image.copy()
            row["messages"] = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image"},
                        {"type": "text", "text": row["instruction"]},
                    ],
                },
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "text",
                            # target is the only ground-truth source.
                            "text": json.dumps(row["target"], ensure_ascii=False),
                        }
                    ],
                },
            ]
            rows.append(row)
    return rows


def assert_no_site_leakage(*splits: tuple[str, list[dict]]) -> None:
    """Fail early when frames from one site occur in multiple splits."""
    sites: dict[str, str] = {}
    for split_name, rows in splits:
        for row in rows:
            site_id = row["site_id"]
            previous = sites.setdefault(site_id, split_name)
            if previous != split_name:
                raise ValueError(f"site_id {site_id!r} appears in {previous} and {split_name}")
