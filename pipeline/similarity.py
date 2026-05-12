"""Compute pairwise cosine similarity across all days two users share, write top 5 to CSV."""
import csv
import itertools
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
IN   = ROOT / "data" / "raw.json"
OUT  = ROOT / "site" / "similarity.csv"


def cosine_sim(a, b):
    dot  = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return None
    return dot / (mag_a * mag_b)


def compute_similarity() -> None:
    data = json.loads(IN.read_text())

    user_days: dict[str, dict[int, list]] = {}
    for rec in data:
        guesses = json.loads(rec["guesses"]) if isinstance(rec["guesses"], str) else rec["guesses"]
        user_days.setdefault(rec["username"], {})[rec["day_number"]] = guesses

    pairs = []
    for u1, u2 in itertools.combinations(sorted(user_days), 2):
        common = sorted(set(user_days[u1]) & set(user_days[u2]))
        if not common:
            continue
        vec1, vec2 = [], []
        for day in common:
            vec1.extend(user_days[u1][day])
            vec2.extend(user_days[u2][day])
        sim = cosine_sim(vec1, vec2)
        if sim is not None:
            pairs.append((u1, u2, sim, len(common)))

    pairs.sort(key=lambda x: x[2], reverse=True)

    with open(OUT, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["user1", "user2", "similarity", "days"])
        for u1, u2, sim, days in pairs[:5]:
            writer.writerow([u1, u2, f"{sim:.4f}", days])

    print(f"Computed {len(pairs)} pairs → top 5 written to {OUT}")
