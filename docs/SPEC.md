---
title: Casework, build spec for the Agent Harness Hackathon (TrueForge)
date: 2026-08-24
status: draft
summary: Build spec for Casework, an agent that works a transit data steward's feed-failure queue. It groups failures by shared root cause, attributes each cause to the party who can actually fix it, drafts the outreach, and stops for human approval before any message leaves. Every quantity in this document was measured against live public feeds on 2026-08-24.
---

# Casework, Build Spec

> **Status: DRAFT.** A companion research report (internal, not in this repository) holds
> the event rules, sponsor analysis, competitor classification and the validation that
> selected this concept. This document is the build design only.
>
> **Event:** The Agent Harness Hackathon (TrueForge), WeMakeDevs + TrueFoundry.
> **Window:** 2026-08-24 08:00 to **2026-08-30 20:00 London**.
> **Tracks targeted:** Double-O (Best Use of TrueForge) primary; Q Branch (Qodo, Best Code
> Quality) and Savile Row (Best UI) are both winnable from the same build and are treated
> as requirements, not stretch goals.

Every count in sections 1 and 3 was measured on **2026-08-24** by `scripts/probe_catalog.py`
against live public endpoints. Section 14 states what is proven and what is not. Absolute
counts move as publishers change their hosting; the probe re-measures them in one command.

---

## 1. Problem

A transit data steward publishes or indexes a few hundred agency feeds. Some fraction of
them break every week. Somebody has to work out what broke, whether it matters yet, whose
fault it is, and who to write to.

That somebody is a person. In California the role is a **weekly on-call analyst**, working
from a dashboard, applying an SOP of three consecutive failure days by eye, and hand-creating
tickets in two separate systems. Around fourteen of the checks in that workflow are recorded
by the operator as ones that can only be performed manually.

The tooling that exists stops one step short of that job:

- **Spec validators** answer "is this document well formed". Free, mature, and the wrong
  question.
- **Feed scorecards** answer "is this feed fresh and conformant", daily, across thousands of
  feeds. Also the wrong question, and their own documentation says so: they measure published
  data, not verified conditions.
- **Alert correlation platforms** group alerts into incidents with a probable upstream cause.
  They do it for alerts from *your* infrastructure, inside *your* topology, routed to *your*
  team. A transit steward's failures are none of those things: the data belongs to other
  organizations, the infrastructure belongs to third parties, and the fix has to be requested
  from someone outside the operator entirely.

So the per-feed view an analyst works from produces the wrong number of tickets addressed to
the wrong parties. Measured on the live public catalog this morning, across the 249 California
GTFS feeds that declare no credential requirement:

| | |
|---|---|
| Feeds checked | 249 |
| Healthy | 196 |
| Failing | **53** |
| Failures that collapse into 3 shared causes | **29** |
| Genuinely individual failures | 24 |
| Tickets a per-feed view produces | 53 |
| Tickets a root-cause view produces | **27** |

Reproduce with `python3 scripts/probe_catalog.py`. **The three clusters are stable across
runs; the healthy and singleton counts are not.** Two runs an hour apart on 2026-08-24 gave
196/53/24 and 192/57/28, with the same three clusters at the same sizes both times. That
spread is transient upstream flakiness, and it is the reason the SOP in section 10 waits
three days before acting on a single-agency failure.

The three shared causes, all verified by direct fetch:

1. **`raw.githubusercontent.com`, 11 agencies, HTTP 404.** All eleven point into a single
   repository, `LACMTA/los-angeles-regional-gtfs`, whose own description reads "LA Metro is
   hosting GTFS data on behalf of various regional agencies". The repository is **public, not
   archived, and was pushed 2026-08-23**. It currently contains three agency directories.
   The catalog references eleven that are no longer present. This is not an outage. It is a
   repository reorganization that silently took eleven agencies' feeds off the air, and none
   of the eleven controls the repository or can restore a path inside it.
2. **`gtfs.calitp.org`, 11 agencies, HTTP 200.** The URL ends `.zip` and the response is
   `Content-Type: text/html`, 14,360 bytes. A status check passes. A content check does not.
3. **`transitfeeds.com`, 7 agencies, HTTP 403.** A deprecated third-party feed service. The
   correct action is to re-point catalog entries, not to contact seven agencies.

And the control that matters as much as any of them: **seven feeds on `api.511.org` returned
HTTP 401 and are healthy.** The catalog marks them `authentication_type = 1`. A naive checker
opens seven tickets against seven agencies for feeds that are working correctly.

## 2. What we are building

Casework turns a list of failing feeds into a queue of **cases**. A case is one root cause,
one responsible party, one drafted message, and one human decision.

The agent:

1. loads the public feed catalog,
2. probes every feed it is responsible for, in the sandbox,
3. classifies each failure by exception type and observed content,
4. groups failures that share a cause,
5. investigates each group to attribute responsibility, which for the LACMTA case means
   reading the repository rather than guessing from the hostname,
6. suppresses everything the SOP says is not actionable yet,
7. drafts one message per case, addressed to the party who can act,
8. **stops.** Nothing is sent without a human pressing approve.

The last step is the security boundary and it is the only irreversible thing the system does.

## 3. Scope

**In scope.** GTFS schedule feeds listed in the public Mobility Database catalog, filtered to
one jurisdiction for the demo (California, 256 entries). HTTP, TLS and content-level checks.
Root-cause grouping. Attribution. Draft generation. Approval. A queue UI.

**Out of scope, explicitly.**

- **WZDx and work zone feeds.** Different substrate, deliberately excluded to keep this
  project separable from other work.
- GTFS-Realtime. The failure classes differ and the observation window is wrong for six days.
- Spec validation. Free tools own it, and this project consumes their verdict rather than
  competing with it.
- Sending mail. The system drafts and gates. Wiring a real SMTP or ticketing transport is a
  configuration concern deliberately left unimplemented for the demo, and the approval gate
  is in front of the seam where it would go.
- Fixing feeds. Casework asks the responsible party. It does not edit anybody's data.

## 4. Architecture on TrueForge

Nothing in this design reimplements a harness feature. Each TrueForge surface is used for the
job it exists for, and the project stops working if you remove any of them.

```
  TrueForge harness
  ├── Agent definition            casework agent, model-agnostic
  ├── Skill (git-backed)          casework-sop/SKILL.md
  │                               the 3-day rule, attribution rules, suppression rules,
  │                               message tone and escalation ladder
  ├── Sandbox + Code Mode         probe_catalog.py, cluster.py, attribute_*.py
  │                               249 concurrent fetches, TLS inspection, magic-byte
  │                               checks. Returns a table, never the payloads.
  ├── Subagents                   one per candidate case, each testing a single
  │                               attribution hypothesis against evidence
  ├── MCP server (ours)           casework-mcp: catalog, cases, evidence, outreach
  ├── Approval gate               on outreach.send, and only there
  └── Session traces              the audit trail the analyst keeps by hand today

  Custom UI  @truefoundry/trueforge-ui  →  queue view + case view
```

**Why Code Mode is load-bearing and not decoration.** 249 feeds, each fetched with a range
request, TLS chain inspected, first bytes examined. The responses total tens of megabytes and
none of them can enter a context window. The script computes in the sandbox and prints a
31-row table. Remove Code Mode and the project cannot run at all, which is the sponsor's own
stated argument about tool payloads compounding across turns.

**Why the approval gate is honest here.** The gated action is a message to an outside
organization about their infrastructure. It cannot be unsent, it reaches a real third party,
and a wrong one costs the operator credibility. That is a genuine irreversible action rather
than a prompt in front of a shell command.

## 5. The MCP server

`casework-mcp`, TypeScript, stdio. Tools:

| Tool | Reads/writes | Notes |
|---|---|---|
| `catalog.load(jurisdiction)` | read | Fetches the public catalog CSV, returns rows with provider, url, auth type, contact presence. **Never returns contact addresses.** |
| `probe.run(feed_ids[])` | read | Delegates to the sandbox script. Returns detections only. |
| `cases.build(detections[])` | write | Clustering plus suppression. Idempotent per run date. |
| `cases.list(state)` | read | Queue for the UI. |
| `evidence.get(case_id)` | read | Every observation backing a case, with timestamps. |
| `repo.inspect(host, path)` | read | GitHub API: does the repo exist, is it archived, when was it pushed, what paths exist. The attribution step for code-hosted feeds. |
| `outreach.draft(case_id)` | write | Produces the message. Not gated. |
| **`outreach.send(case_id)`** | **write, external** | **Approval-gated. The only tool that leaves the building.** |

Contact addresses are resolved inside `outreach.send` at send time and are never returned to
the model, never logged, and never rendered in the UI beyond "contact on file: yes/no".

## 6. Data model

```
Detection   run_date, feed_id, provider, url, host, status_class,
            http_code, tls_ok, content_type, magic_ok, latency_ms

Case        case_id, run_date, cause_key, cause_kind, member_feed_ids[],
            agency_count, responsible_party, confidence, state

Evidence    case_id, kind, observation, source_url, observed_at

Draft       case_id, subject, body, recipient_kind, generated_at

Decision    case_id, actor, action(approve|edit|reject|snooze), at, note
```

`cause_key` is the grouping key, `cause_kind` is one of
`code_host_path_removed | content_type_mismatch | deprecated_service | tls_expired |
auth_rejected | dns_failure | timeout | individual`.

## 7. Classification

Applied to every response, in order. First match wins.

1. Transport failed (DNS, connection reset, timeout) → `network`.
2. TLS chain invalid → `tls_expired`, evidence carries the certificate subject and expiry.
3. HTTP 401/403 **and** catalog declares `authentication_type != 0` → **suppress, healthy.**
4. HTTP 401/403 otherwise → `auth_rejected`.
5. HTTP 404 → `not_found`.
6. HTTP 200 and first two bytes are `PK` → healthy.
7. HTTP 200 and content type is `text/*` or bytes are not a zip → `content_type_mismatch`.

Rule 3 is the one that earns its place. It is the difference between a tool an analyst trusts
and one they stop opening.

## 8. Grouping

Two failures share a cause when they share a host **and** a `status_class`. That is the whole
rule, and it is deliberately dumb, because the interesting work is the next step.

Guards, so the grouping cannot flatter itself:

- A group of one is not a case, it is an individual failure and goes through the 3-day rule.
- Two agencies behind the same CDN with different `status_class` values do not group.
- A group is recorded with its member count so the UI can show what was collapsed.

Measured behaviour on the 2026-08-24 run: 29 failures grouped into 3 cases, **24 remained
individual**. The grouping is not merging indiscriminately, and the singletons are the
evidence for that.

## 9. Attribution

Grouping says these failed together. Attribution says whose problem it is. This is where the
subagents work and where the product stops being a link checker.

| Cause kind | Investigation | Responsible party |
|---|---|---|
| `code_host_path_removed` | `repo.inspect`: does the repo exist, is it archived, last push, which paths are present now | **The repository owner**, never the agencies. If the repo is alive and the paths are gone, the message asks whether they moved or whether the catalog should be re-pointed. |
| `content_type_mismatch` | Fetch once more, record content type and byte prefix | **The host operator.** The platform is serving the wrong thing under a `.zip` URL. |
| `deprecated_service` | Check whether the service publishes an end-of-life notice | **The catalog**, action is re-point. Contacting the agencies is the wrong move. |
| `tls_expired` | Read the certificate subject and expiry | **The certificate holder**, which is usually a vendor and not the agency. |
| `individual` | None until the 3-day rule fires | The agency, and only then. |

Confidence is recorded per case and the UI shows it. A case the agent cannot attribute stays
in the queue as unattributed rather than guessing a recipient.

## 10. Suppression, the 3-day rule

State persists across runs. A `cause_key` seen failing on fewer than three consecutive run
dates produces **no draft and no ticket**, and appears in the queue greyed out with a day
counter. This is the operator's real SOP and it is the single most important reason the tool
would be adopted rather than muted.

For the demo, prior run state is seeded from probe runs made on preceding days so the counter
is real rather than staged. If that is not achievable before the video, the queue shows day
1 of 3 for the singletons and the drafted cases are the three that are independently
evidenced as long-lived. **The seeding method is stated on screen.**

## 11. Interface

Two screens, built on the TrueForge UI SDK.

**Queue.** Cases ranked by agency count. Each row: cause, host, agency count, responsible
party, confidence, state. A suppressed section showing what was deliberately not raised, with
the reason. A healthy count. The screen never shows a list of feeds.

**Case.** Four blocks: what the catalog asks for, what is actually there, attribution with
its evidence, and the draft. One action bar: approve and send, edit, reject, snooze.

Design rule for the whole UI: **every number is clickable through to the observation that
produced it.** Nothing on screen is a summary the user has to trust.

## 12. Demo

Three minutes, four beats, one fixture, no staging.

1. **The queue.** 249 checked, 196 healthy, 53 failing, **27 cases**. State the collapse.
2. **Open the LACMTA case.** Eleven agencies, all 404. The repository is alive and was pushed
   yesterday. The directories the catalog references are not there. Attribution flips from
   eleven cities to one repository owner. This is the beat the submission rests on.
3. **The suppressed block.** Seven feeds returned 401 and are healthy, because the catalog
   says they need a key. A naive checker mails seven agencies. This is the negative control.
4. **Approve one message.** The gate holds, the trace records who approved what.

**Negative controls, all real, none planted:** the singletons that must not group, the 7
suppressed healthy feeds, and the 196 healthy feeds that produce nothing at all.

**Fallback.** The probe output is captured as JSON per run. If an upstream host is slow or
down during judging, the same run replays from capture and the transformation is unchanged.
The video says which mode is running.

## 13. Build plan

Sized in files and lines, not in time. Calendar days are the event's, not an effort estimate.

| Day | Deliverable | Size |
|---|---|---|
| 08-24 | Repo, licence, **Qodo installed on the first PR**, AI-use disclosure in README, `probe_catalog.py`, classification, first real run committed as a fixture | ~250 LOC, 4 files |
| 08-25 | `casework-mcp` skeleton, catalog and probe tools, Detection and Case persistence | ~350 LOC, 6 files |
| 08-26 | Grouping, suppression, 3-day state, `repo.inspect`, attribution rules | ~300 LOC, 4 files |
| 08-27 | Agent definition, `casework-sop/SKILL.md`, subagent per case, draft generation | ~200 LOC, 3 files |
| 08-28 | UI: queue and case views on the TrueForge UI SDK | ~450 LOC, 8 files |
| 08-29 | Approval gate end to end, traces, fallback replay, README with setup that a judge can actually run | ~150 LOC, 3 files |
| 08-30 | Video, written summary, final Qodo pass. **Submit by 20:00 London.** | |

Every day ends with a pull request reviewed by Qodo. The Q Branch track is judged on the
review trail across the week, so a single PR at the end forfeits it.

## 14. What is proven and what is not

**Proven, measured 2026-08-24 on live public endpoints by the committed script.** The
249/196/53 counts. The three clusters and their member agencies, stable across two runs. The
singletons. The seven suppressed 511 feeds and the
catalog field that justifies suppressing them. The LACMTA repository being public, unarchived,
pushed 2026-08-23, and containing three agency directories where the catalog references
eleven. `gtfs.calitp.org` returning `text/html` under a `.zip` URL.

**Not proven.**

- **One attempt per feed at one moment.** A real run repeats before concluding, which is
  exactly why the 3-day rule exists. The single-run numbers are a snapshot, and two runs an
  hour apart differed by four feeds on the healthy count.
- **Host grouping is a heuristic.** The singletons show it is not over-merging on this data.
  That is evidence, not proof.
- **Attribution correctness is asserted per case, not measured.** There is no ground truth
  set. The mitigation is that every attribution carries its evidence and a human approves.
- **Nobody has agreed to use this.** The problem evidence is first-party and public. The
  demand evidence is not, and this document does not claim it.

## 15. Risks

| Risk | Mitigation |
|---|---|
| A judge collapses this to "alert correlation" | Say it first, in the README and the video. The grouping primitive is commodity. The wedge is attributing a fault to an external organization and drafting the request to them, which no correlation platform does. |
| Upstream hosts flap during judging | Captured runs replay; mode stated on screen |
| The 3-day rule cannot be seeded honestly | Show day counters as they really are and say so, rather than staging history |
| Contact data leaking into a public repo | Addresses resolved at send time only, never returned to the model, never rendered, never logged. Enforced by the MCP boundary, not by convention. |
| UI eats the week | Queue and case views only. No settings, no auth, no multi-tenant. |
| Scope drifts into WZDx | Section 3 forbids it |

## 16. Compliance with event rules

- All code written inside the window, which opened 2026-08-24 08:00 London.
- Public repository, README with runnable setup, ~3 minute video, written summary.
- **AI coding assistant use is disclosed in the README**, as the rules require.
- Every data source is public and requires no credential: the Mobility Database catalog CSV,
  agency feed URLs as published, and the GitHub REST API for repository inspection.
- No private, personal or login-protected information in the repository or the video. No
  agency contact address appears in either.
