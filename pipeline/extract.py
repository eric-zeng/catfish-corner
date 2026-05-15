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
        "SELECT day_id, article_name, wikipedia_url FROM answers ORDER BY day_id, answer_index"
    ).fetchall()
    conn.close()

    answers: dict = {}
    for r in answer_rows:
        answers.setdefault(r["day_id"], []).append(
            {"article_name": r["article_name"], "wikipedia_url": r["wikipedia_url"]}
        )
    (ROOT / "site" / "answers.json").write_text(json.dumps(answers, indent=2))
    print(f"Extracted answers for {len(answers)} days → site/answers.json")
