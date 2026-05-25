"""Compute per-user performance broken down by knowledge area and labels."""
import json
import sqlite3
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
DB   = ROOT / "data" / "catfish.db"


def compute_stats(query: str, key_field: str, out_file: pathlib.Path, guard_table: str | None = None) -> None:
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row

    if guard_table:
        tables = [r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if guard_table not in tables:
            print(f"{guard_table} table not found, skipping")
            db.close()
            return

    rows = db.execute(query).fetchall()
    db.close()

    stats: dict = {}
    for row in rows:
        user       = row["username"]
        key        = row[key_field]
        guesses    = json.loads(row["guesses"])
        idx        = row["answer_index"]

        if idx >= len(guesses):
            continue

        guess      = guesses[idx]
        user_stats = stats.setdefault(user, {})
        entry      = user_stats.setdefault(key, {"attempts": 0, "score": 0.0})
        entry["attempts"] += 1
        entry["score"]    += guess

    for user_stats in stats.values():
        for entry in user_stats.values():
            entry["proportion"] = round(entry["score"] / entry["attempts"], 4)
            entry["score"]      = round(entry["score"], 2)

    out_file.write_text(json.dumps(stats, indent=2))
    total_entries = sum(len(v) for v in stats.values())
    print(f"Computed {total_entries} user×{key_field} entries → {out_file}")


def compute_category_stats() -> None:
    compute_stats(
        query="""
            SELECT r.username, r.guesses, a.answer_index, a.knowledge_area
            FROM results r
            JOIN answers a ON a.day_id = r.day_number
            WHERE a.knowledge_area != ''
            ORDER BY r.username, r.day_number, a.answer_index
        """,
        key_field="knowledge_area",
        out_file=ROOT / "site" / "category_stats.json",
    )


def compute_label_stats() -> None:
    compute_stats(
        query="""
            SELECT r.username, r.guesses, al.answer_index, al.label
            FROM results r
            JOIN answer_labels al ON al.day_id = r.day_number
            WHERE al.value = 1
            ORDER BY r.username, r.day_number, al.answer_index
        """,
        key_field="label",
        out_file=ROOT / "site" / "label_stats.json",
        guard_table="answer_labels",
    )


if __name__ == "__main__":
    compute_category_stats()
    compute_label_stats()
