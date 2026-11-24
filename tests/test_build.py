import csv
import json

from pipeline.build import build_history, list_raw, write_history
from pipeline.sources import COLUMNS

from .conftest import cg, cp, write_raw


def test_one_row_per_item_per_day_sorted_by_date_then_item_id(tmp_path):
    write_raw(tmp_path, "2026-11-25", "coingecko", [cg("zcoin", 2), cg("acoin", 1)])
    write_raw(tmp_path, "2026-11-24", "coingecko", [cg("zcoin", 3)])
    write_raw(tmp_path, "2026-11-24", "coinpaprika", [cp("mid", 9)])
    rows = build_history(tmp_path)
    assert [(r["date"], r["item_id"]) for r in rows] == [
        ("2026-11-24", "coingecko:zcoin"), ("2026-11-24", "coinpaprika:mid"),
        ("2026-11-25", "coingecko:acoin"), ("2026-11-25", "coingecko:zcoin")]


def test_day_without_a_source_file_has_no_rows_from_that_source(tmp_path):
    write_raw(tmp_path, "d1", "coingecko", [cg("a", 1)])
    write_raw(tmp_path, "d1", "coinpaprika", [cp("b", 1)])
    write_raw(tmp_path, "d2", "coingecko", [cg("a", 2)])  # coinpaprika failed on d2
    rows = build_history(tmp_path)
    assert [(r["date"], r["source"]) for r in rows] == [
        ("d1", "coingecko"), ("d1", "coinpaprika"), ("d2", "coingecko")]


def test_build_twice_gives_the_same_file(tmp_path):
    write_raw(tmp_path / "raw", "d1", "coingecko", [cg("a", 1.25), cg("b", 2)])
    write_raw(tmp_path / "raw", "d2", "coinpaprika", [cp("c", 3)])
    write_history(build_history(tmp_path / "raw"), tmp_path / "h1.csv")
    write_history(build_history(tmp_path / "raw"), tmp_path / "h2.csv")
    assert (tmp_path / "h1.csv").read_bytes() == (tmp_path / "h2.csv").read_bytes()


def test_header_starts_with_the_four_fixed_columns_and_empty_values_are_blank(tmp_path):
    write_raw(tmp_path / "raw", "d1", "coingecko", [{"id": "x", "name": "X", "symbol": "x", "current_price": 2}])
    write_history(build_history(tmp_path / "raw"), tmp_path / "h.csv")
    rows = list(csv.DictReader(open(tmp_path / "h.csv")))
    assert list(rows[0])[:4] == ["date", "item_id", "item", "source"]
    assert list(rows[0]) == COLUMNS
    assert rows[0]["price_usd"] == "2" and rows[0]["market_cap_usd"] == ""


def test_a_rule_change_applies_to_every_day(tmp_path, monkeypatch):
    import pipeline.build as build
    write_raw(tmp_path, "d1", "coingecko", [cg("a", 1)])
    write_raw(tmp_path, "d2", "coingecko", [cg("a", 2)])
    original = build.convert
    monkeypatch.setattr(build, "convert", lambda s, raw: [dict(r, item=r["item"].upper()) for r in original(s, raw)])
    assert {r["item"] for r in build.build_history(tmp_path)} == {"A"}


def test_unknown_sources_and_other_files_are_ignored(tmp_path):
    write_raw(tmp_path, "d1", "coingecko", [cg("a", 1)])
    write_raw(tmp_path, "d1", "oldsource", [{"id": "z"}])
    (tmp_path / "d1" / "notes.txt").write_text("x")
    assert list(list_raw(tmp_path)["d1"]) == ["coingecko"]
    assert len(build_history(tmp_path)) == 1
