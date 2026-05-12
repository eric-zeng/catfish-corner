"""Pivot results, compute summary stats, write leaderboard.json."""
import json
import math
import pathlib
import pandas as pd
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).parent.parent
IN   = ROOT / "data" / "raw.json"
SITE = ROOT / "site"


def _clean(x):
    """Convert NaN to None for JSON serialisation."""
    if isinstance(x, float) and math.isnan(x):
        return None
    return x


def render() -> None:
    df = pd.read_json(IN)

    pivot = df.pivot_table(index="username", columns="day_number", values="score", aggfunc="first")
    pivot = pivot.reindex(sorted(pivot.columns), axis=1)
    pivot.index.name = None

    days = [int(d) for d in pivot.columns]

    user_mean = pivot.mean(axis=1).round(2)
    user_std  = pivot.std(axis=1).round(2)
    users = user_mean.sort_values(ascending=False).index.tolist()

    scores = {
        user: {int(d): _clean(float(pivot.loc[user, d])) for d in pivot.columns}
        for user in users
    }

    user_stats = {
        user: {"mean": _clean(float(user_mean[user])), "std": _clean(float(user_std[user]))}
        for user in users
    }

    day_stats = {
        "mean": {int(d): _clean(round(float(pivot[d].mean()), 2)) for d in pivot.columns},
        "std":  {int(d): _clean(round(float(pivot[d].std()),  2)) for d in pivot.columns},
    }

    leaderboard = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "days":       days,
        "users":      users,
        "scores":     scores,
        "user_stats": user_stats,
        "day_stats":  day_stats,
    }

    (SITE / "leaderboard.json").write_text(json.dumps(leaderboard, indent=2))

    print(f"Rendered {len(users)} users × {len(days)} days → {SITE / 'leaderboard.json'}")
