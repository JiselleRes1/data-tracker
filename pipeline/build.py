"""Build data/history.csv from the raw files alone.

    python -m pipeline.build

Reads data/raw/<date>/<source>.json.gz for every date, converts each source with its
converter, and writes one row per item per day, sorted by date then item_id. Running it
again gives the same file.
"""
import csv
import gzip
import json
from pathlib import Path

from .sources import COLUMNS, CONVERTERS, convert

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
HISTORY_PATH = ROOT / "data" / "history.csv"


def list_raw(raw_dir=RAW_DIR):
    """{date: {source: path}} for every raw file, ignoring sources no longer configured."""
    out = {}
    raw_dir = Path(raw_dir)
    if not raw_dir.exists():
        return out
    for day_dir in sorted(p for p in raw_dir.iterdir() if p.is_dir()):
        files = {}
        for f in sorted(day_dir.glob("*.json.gz")):
            name = f.name[: -len(".json.gz")]
            if name in CONVERTERS:
                files[name] = f
        if files:
            out[day_dir.name] = files
    return out


def read_raw(path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def build_history(raw_dir=RAW_DIR):
    """Return the history rows (dicts keyed by COLUMNS), sorted by date then item_id."""
    rows = {}
    for day, files in list_raw(raw_dir).items():
        for source, path in files.items():
            for row in convert(source, read_raw(path)):
                rows[(day, row["item_id"])] = {"date": day, **row}
    return [rows[k] for k in sorted(rows)]


def _cell(value):
    return "" if value is None else value


def write_history(rows, path=HISTORY_PATH):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(COLUMNS)
        for r in rows:
            writer.writerow([_cell(r.get(c)) for c in COLUMNS])


def main():
    rows = build_history()
    write_history(rows)
    print(f"wrote {len(rows)} rows to {HISTORY_PATH}")


if __name__ == "__main__":
    main()
