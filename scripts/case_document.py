"""The machine-readable form of a run: what `cases.build` in the MCP server persists.

The rules live in cases.py and run in the sandbox. This module only shapes their output,
so the TypeScript side never has a second implementation of triage or grouping to drift from.
"""

import hashlib

from cases import build_cases, cause_key, streaks, triage

CREDENTIAL_REASON = "catalog declares a credential is required"


def case_id(key):
    """Derived, not allocated: the same cause is the same case tomorrow."""
    return hashlib.sha1(key.encode(), usedforsecurity=False).hexdigest()[:12]


def _case(c, runs):
    return {
        "case_id": case_id(c["cause_key"]),
        "cause_key": c["cause_key"],
        "cause_kind": c["cause_kind"],
        "status_class": c["status_class"],
        "proposed_party": c["proposed_party"],
        "agency_count": len(c["members"]),
        "member_feed_ids": [d["feed_id"] for d in c["members"]],
        "corroborating": [
            {"feed_id": d["feed_id"], "reason": triage(d)} for d in c["corroborating"]
        ],
        "consecutive_runs": runs[c["cause_key"]],
    }


def case_document(detections, run_dir, run_date):
    """Everything one run says, addressed by case. Detections stay in the run file."""
    cases, singles = build_cases(detections)
    runs, prior_runs = streaks(run_dir, run_date, [c["cause_key"] for c in cases + singles])
    in_scope = [d for d in detections if d["status_class"] != "auth_declared"]
    failing = [d for d in in_scope if not d["healthy"]]
    suppressed = [
        {"feed_id": d["feed_id"], "cause_key": cause_key(d), "reason": triage(d)}
        for d in detections
        if triage(d) and not (d["healthy"] and triage(d) != CREDENTIAL_REASON)
    ]
    return {
        "run_date": run_date,
        "prior_runs_on_file": prior_runs,
        "counts": {
            "checked": len(in_scope),
            "healthy": sum(1 for d in in_scope if d["healthy"]),
            "failing": len(failing),
            "suppressed_by_credential": sum(
                1 for s in suppressed if s["reason"] == CREDENTIAL_REASON
            ),
            "suppressed_by_catalog": sum(1 for d in failing if triage(d)),
            "actionable": sum(1 for d in failing if not triage(d)),
        },
        "cases": [_case(c, runs) for c in cases],
        "individual": [_case(c, runs) for c in singles],
        "suppressed": suppressed,
    }
