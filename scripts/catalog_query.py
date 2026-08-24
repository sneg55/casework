#!/usr/bin/env python3
"""What the catalog says, without the 1.12 MB CSV leaving the sandbox.

With --feed-ids it returns those rows. Without, it returns a summary, because 256 rows of
catalog metadata in a tool reply is the payload problem Code Mode exists to avoid.
Contact addresses are never in the output, only whether one is on file.
"""

import argparse
import json
from collections import Counter

from probe_catalog import load_catalog


def row_view(r):
    return {
        "feed_id": r.get("mdb_source_id"),
        "provider": r.get("provider"),
        "url": r.get("urls.direct_download"),
        "auth_type": r.get("urls.authentication_type") or "",
        "catalog_status": r.get("status") or "",
        "redirect_id": r.get("redirect.id") or "",
        "contact_on_file": bool(r.get("feed_contact_email")),
    }


def summary(rows):
    hosts = Counter(r["urls.direct_download"].split("/")[2].lower() for r in rows)
    return {
        "feeds": len(rows),
        "by_status": dict(Counter(r.get("status") or "unset" for r in rows)),
        "by_auth_type": dict(Counter(r.get("urls.authentication_type") or "unset" for r in rows)),
        "with_redirect": sum(1 for r in rows if r.get("redirect.id")),
        "with_contact_on_file": sum(1 for r in rows if r.get("feed_contact_email")),
        "top_hosts": hosts.most_common(10),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--jurisdiction", default="California")
    p.add_argument("--feed-ids", help="comma-separated mdb_source_id list")
    a = p.parse_args()

    ids = a.feed_ids.split(",") if a.feed_ids else None
    rows = load_catalog(a.jurisdiction, ids)
    out = {"jurisdiction": a.jurisdiction, "summary": summary(rows)}
    if ids:
        out["rows"] = [row_view(r) for r in rows]
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
