"""Import results from a CSV file into the database.
Usage: python3 scripts/csv_import.py scripts/optic_chiasm_backfill.csv
"""
import csv
import sqlite3
import pathlib
import sys

if len(sys.argv) < 2:
    print("Usage: python3 scripts/csv_import.py <csv_file>")
    sys.exit(1)

DB  = pathlib.Path(__file__).parent.parent / "data" / "catfish.db"
csv_path = pathlib.Path(sys.argv[1])

conn = sqlite3.connect(DB)
inserted = 0
skipped  = 0

with open(csv_path) as f:
    for row in csv.DictReader(f):
        cur = conn.execute(
            "INSERT OR IGNORE INTO results (username, user_id, date, day_number, score, total, guesses) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (row["username"], row["user_id"], row["date"],
             int(row["day_number"]), float(row["score"]),
             int(row["total"]), row["guesses"])
        )
        if cur.rowcount:
            inserted += 1
            print(f"  ✓ {row['username']} day #{row['day_number']} — {row['score']}/{row['total']}")
        else:
            skipped += 1
            print(f"  - {row['username']} day #{row['day_number']} already exists, skipped")

conn.commit()
conn.close()
print(f"\nDone. {inserted} inserted, {skipped} skipped.")
