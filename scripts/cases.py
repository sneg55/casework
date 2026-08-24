"""What a set of observations means: what the catalog already answers, what groups,
what kind of fault it is, and who to propose writing to.

Every response-class to cause-kind decision lives in this module, in CAUSE_KIND for the
named classes and resolve_cause() for the ones that need the group to decide.
"""
import json, os

# Hosts where the path, not the host, identifies who can restore a missing file.
CODE_HOSTS = {"raw.githubusercontent.com", "gitlab.com", "codeberg.org", "bitbucket.org"}
RETIRED = {"deprecated", "inactive"}
CREDENTIAL_REASON = "catalog declares a credential is required"

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
# cause_kind -> party_kind. Every kind maps to exactly one entry in the recipient
# registry; a kind with no entry is a spec bug, not a runtime fallback.
PARTY = {
    "code_host_path_removed": "repository",
    "deprecated_service": "catalog",
    "content_type_mismatch": "host_operator",
    "tls_expired": "cert_holder",
    "auth_rejected": "host_operator",
    "host_unreachable": "host_operator",
    "redirect_unresolved": "host_operator",
    "path_not_found": "agency",
    "individual": "agency",
}
RETIRED_CLASSES = ("auth_rejected", "not_found", "network", "dns_failure", "timeout")


def triage(d):
    """Why this detection raises nothing, or None if it is actionable.

    The catalog knows things the response does not. An entry the catalog has already
    retired and re-pointed is not a ticket, for the same reason a declared key is not.
    """
    if d["status_class"] == "auth_declared":
        return CREDENTIAL_REASON
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
    """cause_kind and the party to propose, refined by what the catalog says about the
    whole group rather than by a hardcoded list of hosts. An unrecognised class resolves
    by its HTTP family, and anything left over is a host that is not serving."""
    retired = sum(1 for d in everyone if d["catalog_status"] in RETIRED)
    if retired * 2 >= len(everyone) and status_class in RETIRED_CLASSES:
        kind = "deprecated_service"
    elif status_class == "not_found" and host in CODE_HOSTS:
        kind = "code_host_path_removed"
    elif status_class in CAUSE_KIND:
        kind = CAUSE_KIND[status_class]
    elif status_class.startswith("http_3"):
        kind = "redirect_unresolved"
    elif status_class.startswith("http_4"):
        kind = "path_not_found"
    else:
        kind = "host_unreachable"
    return kind, PARTY[kind]


def build_cases(detections):
    """A cause becomes a case on two or more actionable feeds, or on one actionable feed
    corroborated by entries the catalog has already retired for the same cause.

    Credential-suppressed feeds are healthy, so they never corroborate a failure and are
    not grouped at all. Only catalog-state suppressions corroborate.
    """
    groups = {}
    for d in detections:
        reason = triage(d)
        if d["healthy"] or reason == CREDENTIAL_REASON:
            continue
        g = groups.setdefault(cause_key(d), {"members": [], "corroborating": []})
        g["corroborating" if reason else "members"].append(d)

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
            "proposed_party": party,
            "members": g["members"],
            "corroborating": g["corroborating"],
        }
        if len(g["members"]) > 1 or g["corroborating"]:
            cases.append(case)
        else:
            case["cause_kind"] = "individual"
            case["proposed_party"] = PARTY["individual"]
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
        with open(os.path.join(run_dir, f"{date}.json")) as fh:
            prior = json.load(fh)
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
