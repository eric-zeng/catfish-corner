"""Compute per-user performance broken down by fun label."""
import json
import sqlite3
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
DB   = ROOT / "data" / "catfish.db"
OUT  = ROOT / "site" / "fun_label_stats.json"


def compute_fun_label_stats() -> None:
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row

    cols = [r["name"] for r in db.execute("PRAGMA table_info(answers)").fetchall()]
    if "fun_labels" not in cols:
        print("fun_labels column not found, skipping fun label stats")
        db.close()
        return

    rows = db.execute("""
        SELECT r.username, r.guesses, a.answer_index, a.fun_labels
        FROM results r
        JOIN answers a ON a.day_id = r.day_number
        WHERE a.fun_labels != '[]' AND a.fun_labels != ''
        ORDER BY r.username, r.day_number, a.answer_index
    """).fetchall()
    db.close()

    stats: dict = {}
    for row in rows:
        user       = row["username"]
        fun_labels = json.loads(row["fun_labels"] or "[]")
        guesses    = json.loads(row["guesses"])
        idx        = row["answer_index"]

        if idx >= len(guesses) or not fun_labels:
            continue

        guess      = guesses[idx]
        user_stats = stats.setdefault(user, {})
        for label in fun_labels:
            cat = user_stats.setdefault(label, {"attempts": 0, "score": 0.0})
            cat["attempts"] += 1
            cat["score"]    += guess

    for user_stats in stats.values():
        for cat in user_stats.values():
            cat["proportion"] = round(cat["score"] / cat["attempts"], 4)
            cat["score"]      = round(cat["score"], 2)

    OUT.write_text(json.dumps(stats, indent=2))
    total_entries = sum(len(v) for v in stats.values())
    print(f"Computed {total_entries} user×fun-label entries → {OUT}")


if __name__ == "__main__":
    compute_fun_label_stats()
