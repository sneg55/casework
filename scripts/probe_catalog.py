#!/usr/bin/env python3
"""Probe every GTFS feed a jurisdiction publishes and turn the failures into cases.

Reads the public Mobility Database catalog CSV. No credentials, no API key.
Writes one dated detection file per run to data/runs/ and prints the case summary.
Prior runs in that directory give each cause its consecutive-failure count.
"""

import argparse
import concurrent.futures as cf
import csv
import io
import json
import sys
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from case_document import case_document
from cases import CREDENTIAL_REASON, build_cases, streaks, triage
from detection import UA, probe

CATALOG = "https://bit.ly/catalogs-csv"


def load_catalog(jurisdiction, feed_ids=None):
    raw = (
        urllib.request.urlopen(
            urllib.request.Request(CATALOG, headers={"User-Agent": UA}), timeout=60
        )
        .read()
        .decode("utf-8", "replace")
    )
    rows = [
        r
        for r in csv.DictReader(io.StringIO(raw))
        if r.get("data_type") == "gtfs"
        and r.get("location.subdivision_name") == jurisdiction
        and r.get("urls.direct_download")
    ]
    if feed_ids:
        wanted = set(feed_ids)
        rows = [r for r in rows if r.get("mdb_source_id") in wanted]
    return rows


def report(detections, run_dir, run_date, live):
    in_scope = [d for d in detections if d["status_class"] != "auth_declared"]
    healthy = [d for d in in_scope if d["healthy"]]
    failing = [d for d in in_scope if not d["healthy"]]
    credential = [d for d in detections if triage(d) == CREDENTIAL_REASON]
    by_catalog = [d for d in failing if triage(d)]
    cases, singles = build_cases(detections)
    days, prior_runs = streaks(run_dir, run_date, [c["cause_key"] for c in cases + singles])

    print(f"\n  {'live run' if live else 'replay'} {run_date}, {prior_runs} prior run(s) on file")
    print(f"  checked {len(in_scope)}   healthy {len(healthy)}   failing {len(failing)}")
    print(
        f"  suppressed: {len(credential)} declare a credential, "
        f"{len(by_catalog)} the catalog has already retired or not yet shipped"
    )
    print(f"  actionable failures {len(failing) - len(by_catalog)}\n")
    for c in cases:
        n = len(c["members"])
        print(
            f"  {n:>3} {'agencies' if n != 1 else 'agency  '}  {c['cause_key'].split('|')[0]:52.52} "
            f"{c['cause_kind']:22} -> {c['proposed_party']:14} "
            f"run {days[c['cause_key']]}/3"
        )
        for reason, k in Counter(triage(d) for d in c["corroborating"]).most_common():
            print(f"      +{k} corroborating: {reason}")
    grouped = sum(len(c["members"]) for c in cases)
    ready = [c for c in cases + singles if days[c["cause_key"]] >= 3]
    print(f"\n  grouped {grouped} failures into {len(cases)} cases; {len(singles)} individual")
    print(
        f"  candidate causes {len(cases) + len(singles)}, against {len(failing)} "
        f"tickets a per-feed view would open"
    )
    print(f"  past the 3-day rule, so drafted: {len(ready)}")
    print(f"\n  status classes: {dict(Counter(d['status_class'] for d in detections))}")


def emit(detections, run_dir, run_date, live, as_json):
    """One report, two audiences: a person reads the table, cases.build reads the JSON."""
    if as_json:
        print(json.dumps(case_document(detections, run_dir, run_date), indent=1))
    else:
        report(detections, run_dir, run_date, live=live)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--jurisdiction", default="California")
    p.add_argument("--feed-ids", help="comma-separated mdb_source_id list, default all")
    p.add_argument("--timeout", type=int, default=18)
    p.add_argument("--workers", type=int, default=12)
    p.add_argument(
        "--attempts",
        type=int,
        default=2,
        choices=(1, 2),
        help="a second attempt is made on transport failures only",
    )
    p.add_argument("--run-dir", default="data/runs")
    p.add_argument("--no-capture", action="store_true", help="report without writing the run")
    p.add_argument("--replay", help="report a captured run instead of fetching anything")
    p.add_argument(
        "--json",
        action="store_true",
        help="emit the case document on stdout instead of the human report",
    )
    a = p.parse_args()

    if a.replay:
        detections = json.loads(Path(a.replay).read_text())
        emit(detections, a.run_dir, detections[0]["run_date"], live=False, as_json=a.json)
        return

    run_date = datetime.now(UTC).date().isoformat()
    rows = load_catalog(a.jurisdiction, a.feed_ids.split(",") if a.feed_ids else None)
    print(f"catalog: {len(rows)} {a.jurisdiction} GTFS feeds", file=sys.stderr)
    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        detections = list(ex.map(lambda r: probe(r, a.timeout, a.attempts, run_date), rows))

    # before it lands, so it is not its own history
    emit(detections, a.run_dir, run_date, live=True, as_json=a.json)
    if a.no_capture:
        return
    run_dir = Path(a.run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    out = run_dir / f"{run_date}.json"
    out.write_text(json.dumps(detections, indent=1))
    if not a.json:
        print(f"  captured {out}\n")


if __name__ == "__main__":
    main()
