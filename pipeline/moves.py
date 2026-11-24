"""The move rule, and what appeared or disappeared.

Move rule: for every item that has a row on the run day and an earlier row, the move is the
percent change of price_usd from the item's previous row (its previous run) to today:
(new - old) / old * 100. Items are ranked by the size of the move, up or down, and the top
TOP_N are listed.

Appeared: an item the source reports today that it did not report on that source's previous
day with data. Disappeared: an item the source reported on its previous day with data but
does not report today. A source with no data today (it failed) has no appeared or
disappeared items, because nothing is known about it.
"""
TOP_N = 10


def num(value):
    """A history value as a float, or None when empty or not a number."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def compute(rows, day, top=TOP_N):
    """Compare `day` with the previous run. Returns {"moves": [...], "appeared": [...], "gone": [...]}."""
    by_item, source_days = {}, {}
    for r in rows:
        by_item.setdefault(r["item_id"], {})[r["date"]] = r
        source_days.setdefault(r["source"], {}).setdefault(r["date"], set()).add(r["item_id"])

    moves, appeared, gone = [], [], []
    for item_id, days in by_item.items():
        if day not in days:
            continue
        new_row = days[day]
        earlier = [d for d in days if d < day]
        if earlier:
            old_row = days[max(earlier)]
            old, new = num(old_row.get("price_usd")), num(new_row.get("price_usd"))
            if old and new is not None:
                moves.append({"item_id": item_id, "item": new_row["item"], "symbol": new_row.get("symbol", ""),
                              "old": old, "new": new, "old_date": old_row["date"],
                              "pct": (new - old) / old * 100})

    for source, per_day in source_days.items():
        if day not in per_day:
            continue
        previous = [d for d in per_day if d < day]
        if not previous:
            continue
        before, today = per_day[max(previous)], per_day[day]
        names = {r["item_id"]: r["item"] for r in rows if r["source"] == source}
        for item_id in sorted(today - before):
            appeared.append({"item_id": item_id, "item": names.get(item_id, item_id)})
        for item_id in sorted(before - today):
            gone.append({"item_id": item_id, "item": names.get(item_id, item_id)})

    moves.sort(key=lambda m: (-abs(m["pct"]), m["item_id"]))
    return {"moves": moves[:top], "appeared": appeared, "gone": gone}
