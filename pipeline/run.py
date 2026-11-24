"""Daily run: fetch every source, rebuild history, write status, update the Issue.

    python -m pipeline.run [--no-issue]

A source that fails writes no raw file that day; the run still finishes and commits.
Running twice on the same UTC day replaces that day's raw files and Issue.
"""
import argparse
import gzip
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from .build import RAW_DIR, ROOT, build_history, list_raw, write_history
from .moves import compute
from .sources import SOURCES, fetch

STATUS_PATH = ROOT / "data" / "status.json"
RUNS_DIR = ROOT / "data" / "runs"


def utc_now():
    return datetime.now(timezone.utc)


def fetch_all(day, now, raw_dir=RAW_DIR, sources=SOURCES, fetcher=fetch):
    """Fetch every source. Returns one result per source: name, ok, count, error."""
    day_dir = Path(raw_dir) / day
    if day_dir.exists():  # a second run on the same day replaces that day's files
        shutil.rmtree(day_dir)
    results = []
    for src in sources:
        name = src["name"]
        try:
            raw = fetcher(name)
        except Exception as exc:  # one source failing must not stop the run
            print(f"FAIL {name}: {exc}", file=sys.stderr)
            results.append({"name": name, "ok": False, "count": 0, "error": str(exc)[:200]})
            continue
        day_dir.mkdir(parents=True, exist_ok=True)
        with gzip.open(day_dir / f"{name}.{src['format']}.gz", "wt", encoding="utf-8", compresslevel=9) as fh:
            json.dump(raw, fh, separators=(",", ":"))
        print(f"ok   {name}: {len(raw)}")
        results.append({"name": name, "ok": True, "count": len(raw)})
    return results


def make_status(rows, results, changes, day, now, raw_dir=RAW_DIR):
    days = sorted(list_raw(raw_dir))
    return {
        "run_time": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "first_run_date": days[0] if days else day,
        "days_with_success": len(days),
        "items": sum(1 for r in rows if r["date"] == day),
        "new_today": len(changes["appeared"]),
        "gone_today": len(changes["gone"]),
        "sources": [{"name": r["name"], "ok": r["ok"], "count": r["count"]} for r in results],
    }


# ---------------------------------------------------------------- Issue
def _money(x):
    return f"${x:,.2f}" if abs(x) >= 1 else f"${x:.6g}"


def issue_body(day, changes, results):
    out = []
    moves = changes["moves"]
    out.append(f"## Biggest moves since the previous run (top {len(moves)})")
    if moves:
        out += ["", "| Item | Old price | New price | Move |", "|---|---:|---:|---:|"]
        for m in moves:
            out.append(f"| {m['item']} ({m['symbol']}) | {_money(m['old'])} ({m['old_date']}) | "
                       f"{_money(m['new'])} | {m['pct']:+.2f}% |")
    else:
        out.append("_No moves to compare yet — this is the first run, or no item has an earlier value._")
    out += ["", f"## Appeared ({len(changes['appeared'])})"]
    out += [f"- {a['item']} (`{a['item_id']}`)" for a in changes["appeared"]] or ["_None_"]
    out += ["", f"## Disappeared ({len(changes['gone'])})"]
    out += [f"- {g['item']} (`{g['item_id']}`)" for g in changes["gone"]] or ["_None_"]
    failed = [r["name"] for r in results if not r["ok"]]
    out += ["", f"Sources that failed today: {', '.join(failed)}" if failed else "All sources succeeded today."]
    return "\n".join(out)


def gh(*args, check=True, stdin=None):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=check, input=stdin)


def update_issues(day, body):
    """Open (or update) today's Issue and close every other open dated Issue."""
    listing = json.loads(gh("issue", "list", "--state", "all", "--limit", "100",
                            "--json", "number,title,state").stdout or "[]")
    today = next((i for i in listing if i["title"] == day), None)
    if today is None:
        gh("issue", "create", "--title", day, "--body-file", "-", stdin=body)
    else:
        gh("issue", "edit", str(today["number"]), "--body-file", "-", stdin=body)
        if today["state"] == "CLOSED":
            gh("issue", "reopen", str(today["number"]))
    for issue in listing:
        title = issue["title"]
        if issue["state"] == "OPEN" and title != day and len(title) == 10 and title[4] == "-":
            gh("issue", "close", str(issue["number"]))


# ---------------------------------------------------------------- main
def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-issue", action="store_true", help="skip GitHub Issue step")
    args = parser.parse_args(argv)

    now = utc_now()
    day = now.date().isoformat()

    results = fetch_all(day, now)
    rows = build_history()
    write_history(rows)
    changes = compute(rows, day)

    status = make_status(rows, results, changes, day, now)
    STATUS_PATH.write_text(json.dumps(status, indent=2) + "\n")
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    (RUNS_DIR / f"{day}.json").write_text(json.dumps(
        {"run_time": status["run_time"], "sources": results}, indent=2) + "\n")

    print(f"items={status['items']} new={status['new_today']} gone={status['gone_today']}")
    if not args.no_issue:
        try:
            update_issues(day, issue_body(day, changes, results))
        except Exception as exc:  # the data must still be committed if the Issue step fails
            detail = getattr(exc, "stderr", "") or exc
            print(f"::warning::Issue step failed: {detail}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
