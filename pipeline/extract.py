"""Extract all results from SQLite into a raw JSON file."""
import sqlite3
import json
import pathlib

ROOT     = pathlib.Path(__file__).parent.parent
DB       = ROOT / "data" / "catfish.db"
OUT      = ROOT / "data" / "raw.json"
SITE_OUT = ROOT / "site" / "data.json"


def extract() -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    rows = [dict(r) for r in conn.execute("SELECT * FROM results ORDER BY day_number, username")]
    payload = json.dumps(rows, indent=2)
    OUT.write_text(payload)
    SITE_OUT.write_text(payload)
    print(f"Extracted {len(rows)} rows → {OUT}")

    answer_rows = conn.execute(
        "SELECT day_id, answer_index, article_name, wikipedia_url, knowledge_area FROM answers ORDER BY day_id, answer_index"
    ).fetchall()

    tables = [r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    label_rows = conn.execute(
        "SELECT day_id, answer_index, label FROM answer_labels WHERE value = 1"
    ).fetchall() if "answer_labels" in tables else []
    conn.close()

    label_map: dict = {}
    for r in label_rows:
        label_map.setdefault((r["day_id"], r["answer_index"]), []).append(r["label"])

    answers: dict = {}
    for r in answer_rows:
        key = (r["day_id"], r["answer_index"])
        answers.setdefault(r["day_id"], []).append({
            "article_name":   r["article_name"],
            "wikipedia_url":  r["wikipedia_url"],
            "knowledge_area": r["knowledge_area"],
            "labels":         label_map.get(key, []),
        })
    (ROOT / "site" / "answers.json").write_text(json.dumps(answers, indent=2))
    print(f"Extracted answers for {len(answers)} days → site/answers.json")
