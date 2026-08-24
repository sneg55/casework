#!/usr/bin/env python3
"""Probe every GTFS feed a jurisdiction publishes and turn the failures into cases.

Reads the public Mobility Database catalog CSV. No credentials, no API key.
Writes one dated detection file per run to data/runs/ and prints the case summary.
Prior runs in that directory give each cause its consecutive-failure day count.
"""
import argparse, csv, io, json, os, socket, ssl, sys, time, urllib.error, urllib.request
import concurrent.futures as cf
from collections import Counter, defaultdict
from datetime import datetime, timezone
from urllib.parse import urlparse

CATALOG = "https://bit.ly/catalogs-csv"
UA = "casework-probe/0.2 (transit feed health; +https://github.com/sneg55/casework)"

# Hosts where the path, not the host, identifies who can restore a missing file.
CODE_HOSTS = {"raw.githubusercontent.com", "gitlab.com", "codeberg.org", "bitbucket.org"}
RETIRED = {"deprecated", "inactive"}
TRANSIENT = {"timeout", "network", "dns_failure"}

# status_class -> cause_kind, before the per-group refinements in resolve_cause().
CAUSE_KIND = {
    "not_found": "path_not_found",
    "content_type_mismatch": "content_type_mismatch",
    "not_a_zip": "content_type_mismatch",
    "tls_expired": "tls_expired",
    "tls_error": "tls_expired",
    "auth_rejected": "auth_rejected",
    "dns_failure": "host_unreachable",
    "timeout": "host_unreachable",
    "network": "host_unreachable",
}
PARTY = {
    "code_host_path_removed": "repository owner",
    "deprecated_service": "catalog maintainer",
    "content_type_mismatch": "host operator",
    "tls_expired": "certificate holder",
    "auth_rejected": "host operator",
    "host_unreachable": "host operator",
    "redirect_unresolved": "host operator",
    "path_not_found": "feed publisher",
}


def classify(exc, resp_bytes, headers, auth_type):
    """Return (status_class, healthy) for one response. First match wins."""
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


def fetch(url, timeout):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": "bytes=0-2047"})
    started = time.monotonic()
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        return None, r.read(2048), r.headers, r.status, time.monotonic() - started
    except Exception as e:                              # noqa: BLE001 - classified above
        return e, b"", {}, getattr(e, "code", None), time.monotonic() - started


def probe(row, timeout, attempts, run_date):
    """One feed, retried only on transport-level failure. Returns a Detection."""
    url = row["urls.direct_download"]
    for attempt in range(1, attempts + 1):
        exc, body, headers, code, elapsed = fetch(url, timeout)
        status, healthy = classify(exc, body, headers, row.get("urls.authentication_type"))
        if status not in TRANSIENT or attempt == attempts:
            break
    parts = urlparse(url)
    return {
        "run_date": run_date,
        "observed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "feed_id": row.get("mdb_source_id"),
        "provider": row["provider"],
        "url": url,
        "host": parts.netloc.lower(),
        "path": parts.path,
        "status_class": status,
        "healthy": healthy,
        "http_code": code,
        "content_type": (headers.get("Content-Type") or "") if headers else "",
        "magic_ok": body[:2] == b"PK",
        "tls_ok": (status not in ("tls_expired", "tls_error")) if parts.scheme == "https" else None,
        "latency_ms": round(elapsed * 1000),
        "attempts": attempt,
        "auth_type": row.get("urls.authentication_type") or "",
        "catalog_status": row.get("status") or "",
        "redirect_id": row.get("redirect.id") or "",
        "contact_on_file": bool(row.get("feed_contact_email")),   # never the address itself
    }


def triage(d):
    """Why this detection raises nothing, or None if it is actionable.

    The catalog knows things the response does not. An entry the catalog has already
    retired and re-pointed is not a ticket, for the same reason a declared key is not.
    """
    if d["status_class"] == "auth_declared":
        return "catalog declares a credential is required"
    if d["healthy"]:
        return None
    if d["catalog_status"] in RETIRED:
        return ("catalog already re-points this entry" if d["redirect_id"]
                else "catalog marks this entry retired, no replacement recorded")
    if d["catalog_status"] == "development":
        return "catalog marks this entry pre-production"
    return None


def cause_key(d):
    """Group key. On code hosts the owner and repository are part of it, because one
    host serves many repositories and only a repository owner can restore a path."""
    if d["host"] in CODE_HOSTS:
        seg = [s for s in d["path"].split("/") if s][:2]
        if len(seg) == 2:
            return f"{d['host']}/{seg[0]}/{seg[1]}|{d['status_class']}"
    return f"{d['host']}|{d['status_class']}"


def resolve_cause(host, status_class, everyone):
    """cause_kind and the party to approach, refined by what the catalog says about the
    whole group rather than by a hardcoded list of hosts."""
    retired = sum(1 for d in everyone if d["catalog_status"] in RETIRED)
    if retired * 2 >= len(everyone) and status_class in ("auth_rejected", "not_found",
                                                         "network", "dns_failure", "timeout"):
        kind = "deprecated_service"
    elif status_class == "not_found" and host in CODE_HOSTS:
        kind = "code_host_path_removed"
    elif status_class.startswith("http_3"):
        kind = "redirect_unresolved"
    else:
        kind = CAUSE_KIND.get(status_class, "host_unreachable")
    return kind, PARTY[kind]


def build_cases(detections):
    """A cause becomes a case on two or more actionable feeds, or on one actionable feed
    corroborated by entries the catalog has already retired for the same cause."""
    groups = defaultdict(lambda: {"members": [], "corroborating": []})
    for d in detections:
        if d["healthy"] and d["status_class"] != "auth_declared":
            continue
        reason = triage(d)
        if reason == "catalog declares a credential is required":
            continue
        groups[cause_key(d)]["corroborating" if reason else "members"].append(d)

    cases, singles = [], []
    for key, g in groups.items():
        if not g["members"]:
            continue
        host, status_class = key.split("|")[0], key.split("|")[-1]
        kind, party = resolve_cause(host.split("/")[0], status_class,
                                    g["members"] + g["corroborating"])
        case = {
            "cause_key": key,
            "cause_kind": kind,
            "status_class": status_class,
            "responsible_party": party,
            "members": g["members"],
            "corroborating": g["corroborating"],
        }
        if len(g["members"]) > 1 or g["corroborating"]:
            cases.append(case)
        else:
            case["cause_kind"] = "individual"
            case["responsible_party"] = "agency, once the 3-day rule fires"
            singles.append(case)
    cases.sort(key=lambda c: -len(c["members"]))
    return cases, singles


def streaks(run_dir, run_date, keys):
    """Consecutive runs each cause_key has failed, this one included. Counts run files
    present, not calendar days, so a day with no run cannot fake continuity."""
    dates = sorted(f[:-5] for f in os.listdir(run_dir)
                   if f.endswith(".json")) if os.path.isdir(run_dir) else []
    history = []
    for date in (d for d in dates if d < run_date):
        prior = json.load(open(os.path.join(run_dir, f"{date}.json")))
        history.append({cause_key(d) for d in prior if not d["healthy"] and not triage(d)})
    out = {}
    for k in keys:
        n = 1
        for seen in reversed(history):
            if k not in seen:
                break
            n += 1
        out[k] = n
    return out, len(history)


def load_catalog(jurisdiction):
    raw = urllib.request.urlopen(
        urllib.request.Request(CATALOG, headers={"User-Agent": UA}), timeout=60
    ).read().decode("utf-8", "replace")
    return [
        r for r in csv.DictReader(io.StringIO(raw))
        if r.get("data_type") == "gtfs"
        and r.get("location.subdivision_name") == jurisdiction
        and r.get("urls.direct_download")
    ]


def report(detections, run_dir, run_date, live):
    in_scope = [d for d in detections if d["status_class"] != "auth_declared"]
    healthy = [d for d in in_scope if d["healthy"]]
    failing = [d for d in in_scope if not d["healthy"]]
    auth = [d for d in detections if d["status_class"] == "auth_declared"]
    by_catalog = [d for d in failing if triage(d)]
    cases, singles = build_cases(detections)
    days, prior_runs = streaks(run_dir, run_date, [c["cause_key"] for c in cases + singles])

    print(f"\n  {'live run' if live else 'replay'} {run_date}, {prior_runs} prior run(s) on file")
    print(f"  checked {len(in_scope)}   healthy {len(healthy)}   failing {len(failing)}")
    print(f"  suppressed: {len(auth)} declare a credential, "
          f"{len(by_catalog)} the catalog has already retired or not yet shipped")
    print(f"  actionable failures {len(failing) - len(by_catalog)}\n")
    for c in cases:
        n = len(c["members"])
        print(f"  {n:>3} {'agencies' if n != 1 else 'agency  '}  {c['cause_key'].split('|')[0]:52.52} "
              f"{c['cause_kind']:22} -> {c['responsible_party']:18} "
              f"day {days[c['cause_key']]}/3")
        for reason, k in Counter(triage(d) for d in c["corroborating"]).most_common():
            print(f"      +{k} corroborating: {reason}")
    grouped = sum(len(c["members"]) for c in cases)
    ready = [c for c in cases + singles if days[c["cause_key"]] >= 3]
    print(f"\n  grouped {grouped} failures into {len(cases)} cases; {len(singles)} individual")
    print(f"  tickets: per-feed {len(failing)}  ->  root-cause {len(cases) + len(singles)}"
          f"   ({len(ready)} past the 3-day rule, so drafted today)")
    print(f"\n  status classes: {dict(Counter(d['status_class'] for d in detections))}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--jurisdiction", default="California")
    p.add_argument("--timeout", type=int, default=18)
    p.add_argument("--workers", type=int, default=12)
    p.add_argument("--attempts", type=int, default=2,
                   help="retries apply to transport failures only")
    p.add_argument("--run-dir", default="data/runs")
    p.add_argument("--replay", help="report a captured run instead of fetching anything")
    a = p.parse_args()

    if a.replay:
        detections = json.load(open(a.replay))
        report(detections, a.run_dir, detections[0]["run_date"], live=False)
        return

    run_date = datetime.now(timezone.utc).date().isoformat()
    rows = load_catalog(a.jurisdiction)
    print(f"catalog: {len(rows)} {a.jurisdiction} GTFS feeds", file=sys.stderr)
    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        detections = list(ex.map(lambda r: probe(r, a.timeout, a.attempts, run_date), rows))

    os.makedirs(a.run_dir, exist_ok=True)
    out = os.path.join(a.run_dir, f"{run_date}.json")
    report(detections, a.run_dir, run_date, live=True)   # before it lands, so it is not its own history
    json.dump(detections, open(out, "w"), indent=1)
    print(f"  captured {out}\n")


if __name__ == "__main__":
    main()
