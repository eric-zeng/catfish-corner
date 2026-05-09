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
    conn.close()

    payload = json.dumps(rows, indent=2)
    OUT.write_text(payload)
    SITE_OUT.write_text(payload)
    print(f"Extracted {len(rows)} rows → {OUT}")
