# Data Tracker

[![tests](https://github.com/JiselleRes1/data-tracker/actions/workflows/tests.yml/badge.svg)](https://github.com/JiselleRes1/data-tracker/actions/workflows/tests.yml)

A tool that tracks 30 crypto assets. Once a day (several times, so a late or skipped trigger
cannot lose a day), GitHub Actions downloads the latest values, saves what each source returned,
adds one row per coin per day to a history, opens a GitHub Issue with the biggest moves, and
publishes the result as a website (GitHub Pages).

Live site: https://jiselleres1.github.io/data-tracker/

## How it works

1. `pipeline/run.py` calls every source and saves what it returned, compressed and as JSON, to
   `data/raw/<date>/<source>.json.gz`. A source that fails writes no file that day; the run
   continues, and every source's result is recorded in `data/status.json` and `data/runs/<date>.json`.
2. `pipeline/build.py` rebuilds `data/history.csv` **from the raw files alone**, so running it
   again gives the same file and a rule change applies to every day of history.
3. `data/status.json` describes the latest run.
4. An Issue titled with the date lists the biggest moves (old and new values) and any coin that
   appeared or disappeared; the previous day's Issue is closed. It is opened every day, even
   with no changes.
5. The workflow commits `data/` to the repository.

The workflow runs at 00:05, 06:05, 12:05 and 18:05 UTC. A later run on the same UTC date replaces that
date's raw files, rebuilds the history and updates that date's Issue, so each date counts once.

### Build the history from the raw files

```bash
python -m pipeline.build
```

### Run the tests / a full run locally

```bash
pip install -r requirements.txt
python -m pytest -q
python -m pipeline.run --no-issue      # skips the GitHub Issue step
```

## Files

| Path | What it does |
|---|---|
| `pipeline/sources.py` | The two sources: what is requested, what is kept, and the converters to the common columns |
| `pipeline/build.py` | Builds `data/history.csv` from `data/raw/` |
| `pipeline/moves.py` | The move rule and the appeared / disappeared logic |
| `pipeline/run.py` | The daily run: fetch, build, status file, Issue |
| `tests/` | pytest suite: source conversion, move rule, history logic (including a second run on the same day), run behaviour |
| `.github/workflows/daily.yml` | Runs the pipeline four times a day and commits the data |
| `.github/workflows/tests.yml` | Runs the tests on every push |
| `data/raw/<date>/<source>.json.gz` | What each source returned that day |
| `data/history.csv` | One row per item per day |
| `data/status.json` | Latest run: time, counts, per-source result |
| `data/runs/<date>.json` | Per-source result (ok / error) for each day |
| `index.html`, `today.js` | Today page |
| `browse.html`, `browse.js` | Browse page (filters, search, sort, starred shortlist) |
| `trends.html`, `trends.js`, `charts.js` | Trends page: every number is computed in the browser from `history.csv`; dependency-free SVG charts |
| `app.js`, `style.css`, `theme.js` | Shared navigation, data loading and formatting; colors and fonts (the North Pole theme); falling snow, freeze-over page transitions and Santa's sleigh (off when the visitor prefers reduced motion) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Makes the site installable and usable offline |
| `requirements.txt` | Python dependencies (`requests`, `pytest`) |

## Sources

Both return JSON to a request with no login and no API key.

| Source | Format | Endpoint | What is kept |
|---|---|---|---|
| `coingecko` | JSON | `api.coingecko.com/api/v3/coins/markets` | Requested with `ids=` for the 20 tracked coins, so only those come back |
| `coinpaprika` | JSON | `api.coinpaprika.com/v1/tickers` | The API cannot filter by id, so the top 150 are requested and **only the 10 tracked coins are kept** in the raw file |

The two sources track different coins (no overlap). CoinGecko: bitcoin, ethereum, tether,
binancecoin, solana, ripple, usd-coin, cardano, dogecoin, tron, avalanche-2, chainlink, polkadot,
litecoin, bitcoin-cash, the-open-network, monero, uniswap, cosmos, near. CoinPaprika: stellar,
sui, hedera, shiba inu, aave, internet computer, ethereum classic, arbitrum, algorand, injective.

## The history file

`data/history.csv` has one row per item per day, sorted by `date` then `item_id`. Dates are UTC
(`YYYY-MM-DD`); every run takes the UTC date of the moment it runs. A value a source does not
report is left empty.

| Column | Meaning | Unit |
|---|---|---|
| `date` | UTC date of the run | `YYYY-MM-DD` |
| `item_id` | Key that identifies the item from one day to the next: `<source>:<the source's own coin id>` | text |
| `item` | The coin's name | text |
| `source` | Which source reported it (`coingecko` or `coinpaprika`) | text |
| `symbol` | Ticker symbol | text |
| `rank` | Rank by market cap, as that source computes it (1 = largest) | whole number |
| `price_usd` | Price at the time of the run | US dollars |
| `market_cap_usd` | Price × circulating supply | US dollars |
| `volume_24h_usd` | Value traded in the 24 hours before the run | US dollars |
| `change_24h_pct` | Price change over the 24 hours before the run, as the source reports it | percent |

`data/status.json` — `run_time` (UTC), `first_run_date` (date of the earliest raw file),
`days_with_success` (number of different dates with a raw file), `items` (items in the latest
run), `new_today` (items that appeared), `gone_today` (items that disappeared), and `sources`
(`name`, `ok`, `count`).

## The move rule

For every item that has a row on the run day and an earlier row, the **move** is the percent
change of `price_usd` from the item's previous row (its previous run) to today:
`(new − old) ÷ old × 100`. Items are ranked by the size of the move, up or down, and the **top 10**
are listed in the Issue with the old and new price. Today shows the same ten.

An item **appeared** if its source reports it today but did not report it on that source's
previous day with data; it **disappeared** if the source reported it then but not today. A source
that failed today has no appeared or disappeared items, because nothing is known about it.
On the first run there is nothing to compare, so the Issue says so.

## Site

Three pages share one navigation bar, fonts and colors, and load the two data files in the
browser. **Today** shows the time of the last run, each source's status, the counts, every item's
latest values with the change since the previous run, and the biggest moves. **Browse** has
filters (source, size by rank, direction since the last run), a name search, a sort on every
numeric column (up or down), and a star on each item; the shortlist is saved in the browser's
`localStorage`. **Trends** draws any numeric value over the days for the items you pick, and has
five findings, each with its numbers, how they are computed from the history file, and a chart.
The site is installable (web app manifest + service worker). Online, the pages load the data from
the network; offline, they show the last data loaded.
