"""Pivot results, compute summary stats, and render to site/index.html."""
import pathlib
import pandas as pd
from jinja2 import Environment, FileSystemLoader

ROOT      = pathlib.Path(__file__).parent.parent
IN        = ROOT / "data" / "raw.json"
TEMPLATES = ROOT / "templates"
OUT       = ROOT / "site" / "index.html"

SUMMARY_ROWS = {"Daily Mean", "Daily Std Dev"}
SUMMARY_COLS = {"Mean", "Std Dev"}


def fmt_score(x):
    if pd.isna(x): return ""
    return str(int(x)) if x % 1 == 0 else str(x)

def fmt_stat(x):
    if pd.isna(x): return ""
    return f"{x:.2f}"

def hsl_color(x, vmin=0, vmax=10):
    t = max(0.0, min(1.0, (float(x) - vmin) / (vmax - vmin)))
    return f"hsl({int(t * 120)}, 70%, 68%)"

def cell_bg(value, row_label, col):
    if pd.isna(value) or col == "Std Dev" or row_label == "Daily Std Dev":
        return None
    return hsl_color(value)


def render() -> None:
    df = pd.read_json(IN)

    pivot = df.pivot_table(index="username", columns="day_number", values="score", aggfunc="first")
    pivot = pivot.reindex(sorted(pivot.columns), axis=1)
    pivot.columns = [f"#{int(d)}" for d in pivot.columns]
    pivot.index.name = None
    day_cols = list(pivot.columns)

    pivot["Mean"]    = pivot[day_cols].mean(axis=1).round(2)
    pivot["Std Dev"] = pivot[day_cols].std(axis=1).round(2)
    pivot = pivot.sort_values("Mean", ascending=False)
    score_rows = list(pivot.index)

    mean_row = pd.Series({col: pivot.loc[score_rows, col].mean() for col in day_cols}, name="Daily Mean").round(2)
    std_row  = pd.Series({col: pivot.loc[score_rows, col].std()  for col in day_cols}, name="Daily Std Dev").round(2)
    pivot = pd.concat([pivot, pd.DataFrame([mean_row, std_row])])

    all_cols = day_cols + ["Mean", "Std Dev"]
    all_rows = score_rows + ["Daily Mean", "Daily Std Dev"]

    rows = []
    for row_label in all_rows:
        cells = []
        for col in all_cols:
            val = pivot.loc[row_label, col] if col in pivot.columns else None
            is_stat = row_label in SUMMARY_ROWS or col in SUMMARY_COLS
            cells.append({
                "display": fmt_stat(val) if is_stat else fmt_score(val),
                "bg":      cell_bg(val, row_label, col),
                "col_sep": col == "Mean",
            })
        rows.append({
            "label":      row_label,
            "is_summary": row_label in SUMMARY_ROWS,
            "row_sep":    row_label == "Daily Mean",
            "cells":      cells,
        })

    columns = [
        {
            "label":      col,
            "is_summary": col in SUMMARY_COLS,
            "url":        f"https://catfishing.net/game/{col[1:]}" if col.startswith("#") else None,
        }
        for col in all_cols
    ]

    env  = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=False)
    html = env.get_template("index.html.j2").render(columns=columns, rows=rows)

    OUT.write_text(html)
    print(f"Rendered {len(score_rows)} users × {len(day_cols)} days → {OUT}")
