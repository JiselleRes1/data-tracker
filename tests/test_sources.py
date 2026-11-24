from pipeline.sources import COLUMNS, convert

from .conftest import cg, cp


def test_coingecko_conversion():
    rows = convert("coingecko", [cg("bitcoin", 60000.5, "Bitcoin", cap=1.2e12, vol=3e10, chg=-0.9, rank=1)])
    assert rows == [{
        "item_id": "coingecko:bitcoin", "item": "Bitcoin", "source": "coingecko", "symbol": "BIT",
        "rank": 1, "price_usd": 60000.5, "market_cap_usd": 1.2e12, "volume_24h_usd": 3e10,
        "change_24h_pct": -0.9}]


def test_coinpaprika_conversion():
    rows = convert("coinpaprika", [cp("sui-sui", 1.25, "Sui", rank=36)])
    assert rows[0]["item_id"] == "coinpaprika:sui-sui"
    assert rows[0]["price_usd"] == 1.25 and rows[0]["market_cap_usd"] == 5000
    assert rows[0]["volume_24h_usd"] == 50 and rows[0]["change_24h_pct"] == -2.0
    assert rows[0]["rank"] == 36


def test_every_converter_produces_the_common_columns():
    for source, raw in (("coingecko", [cg("a", 1)]), ("coinpaprika", [cp("b", 1)])):
        row = convert(source, raw)[0]
        assert set(row) | {"date"} == set(COLUMNS)


def test_missing_values_stay_empty():
    rows = convert("coingecko", [{"id": "x", "name": "X", "symbol": "x", "current_price": 2}])
    assert rows[0]["market_cap_usd"] is None and rows[0]["change_24h_pct"] is None
    rows = convert("coinpaprika", [{"id": "y", "name": "Y", "symbol": "y"}])
    assert rows[0]["price_usd"] is None


def test_entries_without_an_id_are_skipped():
    assert convert("coingecko", [{"name": "no id"}]) == []
    assert convert("coinpaprika", [{"name": "no id"}]) == []
