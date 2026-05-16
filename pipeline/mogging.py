"""Find days where one player scored >3 points higher than every other player."""
import sqlite3
import pathlib
import pandas as pd

ROOT = pathlib.Path(__file__).parent.parent
DB   = ROOT / "data" / "catfish.db"
OUT  = ROOT / "site" / "mogging.csv"


def main() -> None:
    conn = sqlite3.connect(DB)
    df   = pd.read_sql(
        "SELECT username, day_number, score FROM results ORDER BY day_number, score DESC",
        conn,
    )
    conn.close()

    rows = []
    for day, group in df.groupby("day_number"):
        if len(group) < 2:
            continue
        top      = group.iloc[0]
        rest_avg = group.iloc[1:]["score"].mean()
        margin   = top["score"] - rest_avg
        if margin >= 3:
            rows.append({
                "day":      day,
                "player":   top["username"],
                "score":    top["score"],
                "rest_avg": round(rest_avg, 2),
                "margin":   round(margin, 2),
            })

    result = pd.DataFrame(rows).sort_values("margin", ascending=False).head(5)
    if result.empty:
        print("No days found where a player outscored everyone else by >=3 points.")
    else:
        print(result.to_string(index=False))
    result.to_csv(OUT, index=False)
    print(f"Wrote {len(result)} rows → {OUT}")


if __name__ == "__main__":
    main()
