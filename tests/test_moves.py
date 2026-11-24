from pipeline.moves import compute


def row(date, item_id, price, source="coingecko", item=None):
    return {"date": date, "item_id": item_id, "item": item or item_id, "source": source,
            "symbol": "X", "price_usd": price}


def test_move_is_percent_change_of_price():
    rows = [row("2026-11-24", "a", 100), row("2026-11-25", "a", 110)]
    m = compute(rows, "2026-11-25")["moves"]
    assert len(m) == 1 and m[0]["old"] == 100 and m[0]["new"] == 110
    assert round(m[0]["pct"], 6) == 10.0


def test_biggest_moves_first_up_or_down_and_limited():
    rows = [row("d1", "a", 100), row("d1", "b", 100), row("d1", "c", 100),
            row("d2", "a", 101), row("d2", "b", 80), row("d2", "c", 130)]
    m = compute(rows, "d2", top=2)["moves"]
    assert [x["item_id"] for x in m] == ["c", "b"]


def test_first_day_has_no_moves_and_nothing_appears():
    out = compute([row("d1", "a", 1), row("d1", "b", 2)], "d1")
    assert out == {"moves": [], "appeared": [], "gone": []}


def test_appeared_and_disappeared():
    rows = [row("d1", "a", 1), row("d1", "b", 1), row("d2", "b", 1), row("d2", "c", 1)]
    out = compute(rows, "d2")
    assert [x["item_id"] for x in out["appeared"]] == ["c"]
    assert [x["item_id"] for x in out["gone"]] == ["a"]


def test_failed_source_does_not_make_its_items_disappear():
    rows = [row("d1", "a", 1, "s1"), row("d1", "b", 1, "s2"), row("d2", "b", 1, "s2")]
    assert compute(rows, "d2")["gone"] == []


def test_move_uses_the_previous_run_even_when_days_were_skipped():
    rows = [row("d1", "a", 100), row("d4", "a", 50)]
    m = compute(rows, "d4")["moves"][0]
    assert m["old_date"] == "d1" and round(m["pct"]) == -50


def test_empty_or_zero_old_price_is_not_a_move():
    rows = [row("d1", "a", ""), row("d2", "a", 5), row("d1", "b", 0), row("d2", "b", 5)]
    assert compute(rows, "d2")["moves"] == []
