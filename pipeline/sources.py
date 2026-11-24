"""Sources: what is requested, what is kept, and how each raw response becomes rows.

Each source has a fetcher (returns the raw JSON exactly as the API gave it, cut down to the
coins we track) and a converter (raw JSON -> list of rows with the common columns).
"""
import time

import requests

TIMEOUT = 30
HEADERS = {"User-Agent": "data-tracker/1.0 (student project; daily reader)"}

# Columns every converter produces. history.csv puts date first.
COLUMNS = ["date", "item_id", "item", "source", "symbol", "rank",
           "price_usd", "market_cap_usd", "volume_24h_usd", "change_24h_pct"]

# Coins tracked per source (ids are each API's own ids). The sources track different coins.
COINGECKO_IDS = [
    "bitcoin", "ethereum", "tether", "binancecoin", "solana", "ripple", "usd-coin", "cardano",
    "dogecoin", "tron", "avalanche-2", "chainlink", "polkadot", "litecoin", "bitcoin-cash",
    "the-open-network", "monero", "uniswap", "cosmos", "near",
]
COINPAPRIKA_IDS = [
    "xlm-stellar", "sui-sui", "hbar-hedera-hashgraph", "shib-shiba-inu", "aave-new",
    "icp-internet-computer", "etc-ethereum-classic", "arb-arbitrum", "algo-algorand",
    "inj-injective-protocol",
]

SOURCES = [
    {"name": "coingecko", "format": "json", "label": "CoinGecko markets API"},
    {"name": "coinpaprika", "format": "json", "label": "CoinPaprika tickers API"},
]


def source_names():
    return [s["name"] for s in SOURCES]


def _get_json(url, params=None, retries=5):
    last = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as exc:
            last = exc
            time.sleep(5 * (attempt + 1))  # public APIs rate-limit shared runner addresses
    raise last


def fetch_coingecko():
    """One request, asking only for the tracked coins."""
    data = _get_json("https://api.coingecko.com/api/v3/coins/markets", params={
        "vs_currency": "usd", "ids": ",".join(COINGECKO_IDS), "order": "market_cap_desc",
        "per_page": 100, "page": 1, "price_change_percentage": "24h"})
    if not isinstance(data, list) or not data:
        raise RuntimeError("coingecko returned no coins")
    return data


def fetch_coinpaprika():
    """The API cannot filter by id, so ask for the top 150 and keep only the tracked coins."""
    data = _get_json("https://api.coinpaprika.com/v1/tickers", params={"quotes": "USD", "limit": 150})
    kept = [t for t in data if t.get("id") in COINPAPRIKA_IDS]
    if not kept:
        raise RuntimeError("coinpaprika returned none of the tracked coins")
    return kept


FETCHERS = {"coingecko": fetch_coingecko, "coinpaprika": fetch_coinpaprika}


def fetch(source_name):
    """Return the raw JSON (a list) for a source. Raises on any failure."""
    return FETCHERS[source_name]()


# ----------------------------------------------------------------- converters
def convert_coingecko(raw):
    return [{
        "item_id": f"coingecko:{c['id']}",
        "item": c.get("name", ""),
        "source": "coingecko",
        "symbol": (c.get("symbol") or "").upper(),
        "rank": c.get("market_cap_rank"),
        "price_usd": c.get("current_price"),
        "market_cap_usd": c.get("market_cap"),
        "volume_24h_usd": c.get("total_volume"),
        "change_24h_pct": c.get("price_change_percentage_24h"),
    } for c in raw if c.get("id")]


def convert_coinpaprika(raw):
    rows = []
    for t in raw:
        if not t.get("id"):
            continue
        usd = (t.get("quotes") or {}).get("USD") or {}
        rows.append({
            "item_id": f"coinpaprika:{t['id']}",
            "item": t.get("name", ""),
            "source": "coinpaprika",
            "symbol": (t.get("symbol") or "").upper(),
            "rank": t.get("rank"),
            "price_usd": usd.get("price"),
            "market_cap_usd": usd.get("market_cap"),
            "volume_24h_usd": usd.get("volume_24h"),
            "change_24h_pct": usd.get("percent_change_24h"),
        })
    return rows


CONVERTERS = {"coingecko": convert_coingecko, "coinpaprika": convert_coinpaprika}


def convert(source_name, raw):
    """Convert one source's raw JSON to rows (without the date column)."""
    return CONVERTERS[source_name](raw)
