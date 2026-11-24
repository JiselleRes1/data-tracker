import gzip
import json

from pipeline import run
from pipeline.build import build_history, write_history
from pipeline.moves import compute
from pipeline.sources import SOURCES

from .conftest import cg, cp


def make_fetcher(price=1.0, fail=()):
    def fetcher(name):
        if name in fail:
            raise RuntimeError("boom")
        return [cg("a", price)] if name == "coingecko" else [cp("b", price)]
    return fetcher


def test_failed_source_writes_no_file_and_does_not_stop_the_run(tmp_path):
    results = run.fetch_all("d1", None, tmp_path, SOURCES, make_fetcher(fail={"coingecko"}))
    assert [(r["name"], r["ok"]) for r in results] == [("coingecko", False), ("coinpaprika", True)]
    assert "boom" in results[0]["error"]
    assert not (tmp_path / "d1" / "coingecko.json.gz").exists()
    assert (tmp_path / "d1" / "coinpaprika.json.gz").exists()


def test_raw_file_is_compressed_json(tmp_path):
    run.fetch_all("d1", None, tmp_path, SOURCES, make_fetcher(price=7))
    with gzip.open(tmp_path / "d1" / "coingecko.json.gz", "rt") as fh:
        assert json.load(fh)[0]["current_price"] == 7


def test_second_run_on_the_same_day_replaces_that_days_files(tmp_path):
    run.fetch_all("d1", None, tmp_path, SOURCES, make_fetcher(price=1))
    run.fetch_all("d1", None, tmp_path, SOURCES, make_fetcher(price=2))
    rows = build_history(tmp_path)
    assert len(rows) == 2 and {r["price_usd"] for r in rows} == {2}


def test_second_run_counts_the_day_once(tmp_path):
    from datetime import datetime, timezone
    now = datetime(2026, 11, 24, 12, tzinfo=timezone.utc)
    for price in (1, 2):
        results = run.fetch_all("2026-11-24", now, tmp_path, SOURCES, make_fetcher(price))
        rows = build_history(tmp_path)
        status = run.make_status(rows, results, compute(rows, "2026-11-24"), "2026-11-24", now, tmp_path)
    assert status["days_with_success"] == 1 and status["items"] == 2


def test_status_keys_and_values(tmp_path):
    from datetime import datetime, timezone
    d1 = datetime(2026, 11, 24, 12, tzinfo=timezone.utc)
    run.fetch_all("2026-11-24", d1, tmp_path, SOURCES, make_fetcher())
    results = run.fetch_all("2026-11-25", d1, tmp_path, SOURCES, make_fetcher(fail={"coinpaprika"}))
    rows = build_history(tmp_path)
    status = run.make_status(rows, results, compute(rows, "2026-11-25"), "2026-11-25", d1, tmp_path)
    assert set(status) == {"run_time", "first_run_date", "days_with_success", "items",
                           "new_today", "gone_today", "sources"}
    assert status["first_run_date"] == "2026-11-24" and status["days_with_success"] == 2
    assert status["items"] == 1 and status["gone_today"] == 0
    assert status["sources"] == [{"name": "coingecko", "ok": True, "count": 1},
                                 {"name": "coinpaprika", "ok": False, "count": 0}]


def test_issue_body_lists_moves_with_old_and_new_values():
    changes = {"moves": [{"item": "Bitcoin", "symbol": "BTC", "old": 100.0, "new": 110.0,
                          "old_date": "d1", "pct": 10.0}],
               "appeared": [{"item_id": "x:new", "item": "New"}], "gone": []}
    body = run.issue_body("d2", changes, [{"name": "s", "ok": False}])
    assert "$100.00" in body and "$110.00" in body and "+10.00%" in body
    assert "New" in body and "Sources that failed today: s" in body


def test_issue_body_on_a_day_with_no_changes():
    body = run.issue_body("d1", {"moves": [], "appeared": [], "gone": []}, [{"name": "s", "ok": True}])
    assert "No moves" in body and "_None_" in body and "All sources succeeded" in body
