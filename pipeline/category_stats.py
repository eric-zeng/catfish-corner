"""Compute per-user performance broken down by knowledge area category."""
import json
import sqlite3
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
DB   = ROOT / "data" / "catfish.db"
OUT  = ROOT / "site" / "category_stats.json"


def compute_category_stats() -> None:
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row

    rows = db.execute("""
        SELECT r.username, r.guesses, a.answer_index, a.knowledge_area
        FROM results r
        JOIN answers a ON a.day_id = r.day_number
        WHERE a.knowledge_area != ''
        ORDER BY r.username, r.day_number, a.answer_index
    """).fetchall()
    db.close()

    # { username -> { category -> { attempts, score } } }
    stats: dict = {}
    for row in rows:
        user     = row["username"]
        category = row["knowledge_area"]
        guesses  = json.loads(row["guesses"])
        idx      = row["answer_index"]

        if idx >= len(guesses):
            continue

        guess = guesses[idx]

        user_stats = stats.setdefault(user, {})
        cat_stats  = user_stats.setdefault(category, {"attempts": 0, "score": 0.0})
        cat_stats["attempts"] += 1
        cat_stats["score"]    += guess

    # Add proportion to each entry
    for user_stats in stats.values():
        for cat_stats in user_stats.values():
            cat_stats["proportion"] = round(cat_stats["score"] / cat_stats["attempts"], 4)
            cat_stats["score"]      = round(cat_stats["score"], 2)

    OUT.write_text(json.dumps(stats, indent=2))
    total_entries = sum(len(v) for v in stats.values())
    print(f"Computed {total_entries} user×category entries → {OUT}")


if __name__ == "__main__":
    compute_category_stats()
