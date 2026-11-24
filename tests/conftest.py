import gzip
import json


def write_raw(raw_dir, day, source, payload):
    d = raw_dir / day
    d.mkdir(parents=True, exist_ok=True)
    with gzip.open(d / f"{source}.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(payload, fh)


def cg(id_, price, name=None, cap=1000, vol=10, chg=1.5, rank=1):
    return {"id": id_, "symbol": id_[:3], "name": name or id_.title(), "market_cap_rank": rank,
            "current_price": price, "market_cap": cap, "total_volume": vol,
            "price_change_percentage_24h": chg}


def cp(id_, price, name=None, rank=30):
    return {"id": id_, "name": name or id_, "symbol": id_[:3], "rank": rank,
            "quotes": {"USD": {"price": price, "market_cap": 5000, "volume_24h": 50,
                               "percent_change_24h": -2.0}}}
