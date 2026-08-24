"""The rules that decide whether a human gets a ticket. Fixtures are shaped like the
committed run, so a change in Detection's fields breaks these first."""

import json
from pathlib import Path

import pytest

from cases import build_cases, cause_key, resolve_cause, streaks, triage

RUN = Path(__file__).resolve().parents[1] / "data" / "runs" / "2026-08-24.json"


def det(**over):
    base = {
        "feed_id": "1",
        "provider": "Somewhere Transit",
        "host": "example.org",
        "path": "/gtfs.zip",
        "status_class": "not_found",
        "healthy": False,
        "catalog_status": "",
        "redirect_id": "",
    }
    return base | over


def test_credential_suppression_keeps_the_feed_healthy():
    d = det(status_class="auth_declared", healthy=True)
    assert triage(d) == "catalog declares a credential is required"


@pytest.mark.parametrize(
    ("catalog_status", "redirect_id", "expected"),
    [
        ("deprecated", "2684", "catalog already re-points this entry"),
        ("inactive", "", "catalog marks this entry retired, no replacement recorded"),
        ("development", "", "catalog marks this entry pre-production"),
        ("active", "", None),
        ("", "", None),
    ],
)
def test_catalog_state_decides_suppression(catalog_status, redirect_id, expected):
    assert triage(det(catalog_status=catalog_status, redirect_id=redirect_id)) == expected


def test_cause_key_carries_the_repository_on_a_code_host():
    d = det(host="raw.githubusercontent.com", path="/LACMTA/los-angeles-regional-gtfs/main/x.zip")
    assert cause_key(d) == "raw.githubusercontent.com/LACMTA/los-angeles-regional-gtfs|not_found"


def test_two_repositories_on_one_host_do_not_group():
    a = det(host="raw.githubusercontent.com", path="/one/repo-a/main/x.zip")
    b = det(host="raw.githubusercontent.com", path="/two/repo-b/main/x.zip")
    assert cause_key(a) != cause_key(b)


def test_a_mostly_retired_group_is_a_dead_service_not_an_auth_problem():
    members = [det(status_class="auth_rejected", catalog_status="deprecated") for _ in range(6)]
    members.append(det(status_class="auth_rejected"))
    kind, party = resolve_cause("transitfeeds.com", "auth_rejected", members)
    assert (kind, party) == ("deprecated_service", "catalog")


def test_a_live_group_keeps_its_response_level_cause():
    members = [det(status_class="auth_rejected") for _ in range(4)]
    assert resolve_cause("example.org", "auth_rejected", members)[0] == "auth_rejected"


def test_one_failure_with_retired_siblings_is_a_case_not_a_singleton():
    live = det(feed_id="a", host="transitfeeds.com", status_class="auth_rejected")
    retired = det(
        feed_id="b",
        host="transitfeeds.com",
        status_class="auth_rejected",
        catalog_status="deprecated",
        redirect_id="2684",
    )
    cases, singles = build_cases([live, retired])
    assert not singles
    assert len(cases) == 1
    assert len(cases[0]["members"]) == 1
    assert len(cases[0]["corroborating"]) == 1


def test_one_failure_alone_waits_for_the_three_run_rule():
    cases, singles = build_cases([det()])
    assert not cases
    assert singles[0]["cause_kind"] == "individual"


def test_credential_rows_never_corroborate_a_failure():
    live = det(feed_id="a", host="api.example.org", status_class="auth_rejected")
    declared = det(
        feed_id="b",
        host="api.example.org",
        status_class="auth_declared",
        healthy=True,
        auth_type="1",
    )
    cases, singles = build_cases([live, declared])
    assert not cases
    assert len(singles) == 1


def test_a_streak_needs_consecutive_runs(tmp_path):
    key = "example.org|not_found"
    for date, failing in (("2026-08-21", True), ("2026-08-22", False), ("2026-08-23", True)):
        rows = [det(healthy=not failing, status_class="not_found" if failing else "ok")]
        (tmp_path / f"{date}.json").write_text(json.dumps(rows))
    days, prior = streaks(str(tmp_path), "2026-08-24", [key])
    assert prior == 3
    assert days[key] == 2  # 08-23 and today; 08-22 broke the run


def test_the_committed_run_still_produces_the_documented_cases():
    detections = json.loads(RUN.read_text())
    cases, singles = build_cases(detections)
    assert [len(c["members"]) for c in cases] == [7, 5, 1]
    assert [c["cause_kind"] for c in cases] == [
        "code_host_path_removed",
        "content_type_mismatch",
        "deprecated_service",
    ]
    assert len(singles) == 15
