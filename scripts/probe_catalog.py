#!/usr/bin/env python3
"""Probe every GTFS feed a jurisdiction publishes and classify what came back.

Reads the public Mobility Database catalog CSV. No credentials, no API key.
Prints the case summary; writes raw detections to --out for replay.
"""
import argparse, csv, io, json, socket, ssl, sys, urllib.error, urllib.request
import concurrent.futures as cf
from collections import Counter, defaultdict
from urllib.parse import urlparse

CATALOG = "https://bit.ly/catalogs-csv"
UA = "casework-probe/0.1 (transit feed health; +https://github.com/sneg55/casework)"


def classify(exc, resp_bytes, headers, auth_type):
    """Return (status_class, healthy). Order matters; first match wins."""
    if exc is not None:
        if isinstance(exc, urllib.error.HTTPError):
            if exc.code in (401, 403) and str(auth_type) not in ("0", "", "None"):
                return "auth_declared", True          # catalog says a key is required
            if exc.code in (401, 403):
                return "auth_rejected", False
            if exc.code == 404:
                return "not_found", False
            return f"http_{exc.code}", False
        reason = getattr(exc, "reason", exc)
        if isinstance(reason, ssl.SSLCertVerificationError):
            return "tls_expired", False
        if isinstance(reason, ssl.SSLError):
            return "tls_error", False
        if isinstance(reason, socket.gaierror):
            return "dns_failure", False
        if isinstance(reason, (TimeoutError, socket.timeout)):
            return "timeout", False
        return "network", False
    ctype = (headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if resp_bytes[:2] == b"PK":
        return "ok", True
    if ctype.startswith("text/") or ctype == "application/json":
        return "content_type_mismatch", False
    return "not_a_zip", False


def probe(row, timeout):
    url = row["urls.direct_download"]
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": "bytes=0-2047"})
    exc = body = None
    headers = {}
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        body, headers = r.read(2048), r.headers
        code = r.status
    except Exception as e:                                  # noqa: BLE001 - classified below
        exc, code = e, getattr(e, "code", None)
    status, healthy = classify(exc, body or b"", headers, row.get("urls.authentication_type"))
    return {
        "provider": row["provider"],
        "url": url,
        "host": urlparse(url).netloc.lower(),
        "path": urlparse(url).path,
        "status_class": status,
        "healthy": healthy,
        "http_code": code,
        "content_type": (headers.get("Content-Type") or "") if headers else "",
        "auth_type": row.get("urls.authentication_type"),
        "contact_on_file": bool(row.get("feed_contact_email")),   # never the address itself
    }


def build_cases(detections):
    """Group failures sharing (host, status_class). A group of one is not a case."""
    failing = [d for d in detections if not d["healthy"]]
    groups = defaultdict(list)
    for d in failing:
        groups[(d["host"], d["status_class"])].append(d)
    cases, singles = [], []
    for (host, status), members in groups.items():
        (cases if len(members) > 1 else singles).append(
            {"host": host, "status_class": status, "members": members}
        )
    cases.sort(key=lambda c: -len(c["members"]))
    return cases, singles


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--jurisdiction", default="California")
    p.add_argument("--timeout", type=int, default=18)
    p.add_argument("--workers", type=int, default=12)
    p.add_argument("--out", default="detections.json")
    a = p.parse_args()

    raw = urllib.request.urlopen(
        urllib.request.Request(CATALOG, headers={"User-Agent": UA}), timeout=60
    ).read().decode("utf-8", "replace")
    rows = [
        r for r in csv.DictReader(io.StringIO(raw))
        if r.get("data_type") == "gtfs"
        and r.get("location.subdivision_name") == a.jurisdiction
        and r.get("urls.direct_download")
    ]
    print(f"catalog: {len(rows)} {a.jurisdiction} GTFS feeds", file=sys.stderr)

    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        detections = list(ex.map(lambda r: probe(r, a.timeout), rows))
    json.dump(detections, open(a.out, "w"), indent=1)

    suppressed = [d for d in detections if d["status_class"] == "auth_declared"]
    scope = [d for d in detections if d["status_class"] != "auth_declared"]
    healthy = [d for d in scope if d["healthy"]]
    cases, singles = build_cases(scope)

    print(f"\n  checked {len(scope)}   healthy {len(healthy)}   failing {len(scope)-len(healthy)}")
    print(f"  suppressed (catalog declares a key is required, feeds are healthy): {len(suppressed)}\n")
    for c in cases:
        print(f"  {len(c['members']):>3} agencies  {c['host']:34} {c['status_class']}")
    grouped = sum(len(c["members"]) for c in cases)
    print(f"\n  grouped {grouped} failures into {len(cases)} cases; {len(singles)} individual")
    print(f"  tickets: per-feed {grouped+len(singles)}  ->  root-cause {len(cases)+len(singles)}")
    print(f"\n  status classes: {dict(Counter(d['status_class'] for d in detections))}")


if __name__ == "__main__":
    main()
