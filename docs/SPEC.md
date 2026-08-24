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

Every count of feeds, failures, causes and suppressions in this document was measured on
**2026-08-24** by `scripts/probe_catalog.py` against live public endpoints, and the run it was
measured from is committed at `data/runs/2026-08-24.json`. Three statements are not the probe's
and are marked where they appear: the operator's manual-check count, the state of the LACMTA
repository, and the catalog-wide repository count. Section 14 states what is proven and what is
not. Absolute counts move as publishers change their hosting; the probe re-measures them in one
command.

---

## 1. Problem

A transit data steward publishes or indexes a few hundred agency feeds. Some fraction of
them break every week. Somebody has to work out what broke, whether it matters yet, whose
fault it is, and who to write to.

That somebody is a person. In California the role is a **weekly on-call analyst**, working
from a dashboard, applying an SOP of three consecutive failure days by eye, and hand-creating
tickets in two separate systems. Around fourteen of the checks in that workflow are recorded
by the operator as ones that can only be performed manually. That count comes from the
operator's own description of the workflow, not from this probe.

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
| Of those, entries the catalog itself has already retired or not yet shipped | **25** |
| Actionable failures | **28** |
| Actionable failures that collapse into 3 shared causes | 13 |
| Genuinely individual failures | 15 |
| Tickets a per-feed view produces | 53 |
| Tickets a root-cause view produces | **18** |

Reproduce with `python3 scripts/probe_catalog.py`, which writes `data/runs/<date>.json` and
replays any captured run with `--replay`. **The three cases are stable across runs; the healthy
and singleton counts are not.** Runs on 2026-08-24 have given 196 healthy and 192, with the same
three cases at the same sizes every time, and the last two runs of the day agreed on the status
class of all 256 feeds. A date holds one file, so the committed artifact is the last run of
2026-08-24 and cross-run agreement is an observation rather than something the repository proves.
From 08-25 the dated files make it checkable. That spread is transient upstream flakiness, and
it is the reason the SOP in section 10 waits three days before acting on a single-agency
failure.

Of the fifty-three, twenty-five deserve their own line, because they are the difference between
a tool an analyst trusts and one they mute. The catalog carries a `status` field and a
`redirect.id` field. **The catalog marks 20 of the failing entries `deprecated`, and every one
of them already names its replacement feed.** A further five are marked `development`, three of
them under `gtfs.calitp.org/test/`, named `TestFlex1.zip`, `TestFlex2.zip` and `TestFlex3.zip`.
None of the twenty-five is a ticket, and a checker that reads only the HTTP response cannot know
that.

The three shared causes, all verified by direct fetch:

1. **`LACMTA/los-angeles-regional-gtfs` on `raw.githubusercontent.com`, 7 agencies, HTTP 404.**
   All of them point into a single repository, whose own description reads "LA Metro is hosting
   GTFS data on behalf of various regional agencies". The repository is **public, not archived,
   and was pushed 2026-08-23**, and it currently contains three agency directories. Those four
   facts come from the GitHub API, read by hand on 2026-08-24 and by `repo.inspect` once it
   exists; the probe run does not contain them. The catalog
   references eleven directories that are no longer present, and it has already re-pointed four
   of those eleven elsewhere, which leaves **seven live entries dark and four that corroborate
   the cause rather than dilute it**. This is not an outage. It is a repository reorganization,
   and none of the seven agencies controls the repository or can restore a path inside it.
2. **`gtfs.calitp.org`, 5 agencies, HTTP 206.** The URL ends `.zip` and the response is
   `Content-Type: text/html`. A status check passes. A content check does not. A further six
   entries on the same host share the symptom and are suppressed: five are `development`, one
   is already re-pointed.
3. **`transitfeeds.com`, 1 agency, HTTP 403.** A retired third-party feed service. The catalog
   already marks six of its seven entries `deprecated` with a replacement recorded. The
   seventh is not, and that single unretired entry is the whole case: the action is to record
   a replacement in the catalog, not to contact an agency. **This is a case on one member
   because six retired siblings prove the host is gone**, and it is the clearest example in
   the dataset of the catalog's own state doing attribution work.

And the control that matters as much as any of them: **seven feeds returned HTTP 401 and are
healthy**, six on `api.511.org` and one on `api.actransit.org`. The catalog marks all seven
`authentication_type = 1`. A naive checker opens seven tickets against seven agencies for feeds
that are working correctly.

## 2. What we are building

Casework turns a list of failing feeds into a queue of **cases**. A case is one root cause,
one responsible party, one drafted message, and one human decision.

The agent:

1. loads the public feed catalog, including the state the catalog already declares about each
   entry: credential required, retired, re-pointed, pre-production,
2. probes every feed it is responsible for, in the sandbox,
3. classifies each failure by exception type and observed content,
4. triages out every failure the catalog has already answered, and records why,
5. groups the remainder by shared cause,
6. investigates each group to attribute responsibility, which for the LACMTA case means
   reading the repository rather than guessing from the hostname,
7. suppresses everything the SOP says is not actionable yet,
8. drafts one message per case, addressed to the party who can act,
9. **stops.** Nothing is sent without a human pressing approve.

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
  ├── Sandbox + Code Mode         probe_catalog.py, detection.py, cases.py,
  │                               case_document.py, catalog_query.py
  │                               256 feeds, 12 at a time, range-limited reads and
  │                               magic-byte checks. Returns a table, never the payloads.
  ├── Subagents                   one per candidate case, each testing a single
  │                               attribution hypothesis against evidence
  ├── MCP server (ours)           casework-mcp: catalog, cases, evidence, outreach
  ├── Approval gate               on outreach.send, and only there
  └── Session traces              the audit trail the analyst keeps by hand today

  Custom UI  @truefoundry/trueforge-ui  →  queue view + case view
```

**Configuration, against the shipped packages** (`@truefoundry/trueforge` 0.1.4, `-core`
0.1.4, `-ui` 0.2.4, read on 2026-08-24):

- **Approval** is declarative, per MCP server, in
  `AgentSpecSchema.mcp_servers[].require_approval_for_tools`, which takes tool names or the
  selectors `@all`, `@write`, `@destructive`. Casework names `outreach.send` explicitly rather
  than using a selector, so adding a write tool later cannot silently widen the gate.
- **Sandbox** is `config.sandbox.enabled`. The harness ships a `local` provider alongside the
  Daytona and TrueFoundry ones, so the demo needs no sandbox account or key.
- **Subagents** are `config.dynamic_sub_agents.enabled`. **Generative UI** is
  `config.generative_ui.enabled`, see section 11.
- **Skills are referenced by name only** and the mount comes from the harness skill store, so
  `casework-sop` has to be registered with the running harness. Committing `SKILL.md` to this
  repository is not by itself enough, and registering it is part of the setup the README gives
  a judge.
- **A model is required**, as `model.name` in FQN form. Casework routes through the
  **TrueFoundry LLM gateway**, which keeps the model swappable and keeps the whole stack on the
  sponsor's surfaces. The cost is that a judge needs a gateway account, so the README opens with
  that step and states the exact model FQN the demo was recorded against. Nothing else in the
  design depends on the choice.

**Stack.** Two languages, split along the sandbox boundary, because that is where the harness
itself splits.

| Layer | Choice | Why this one |
|---|---|---|
| Sandbox code | **Python 3.11+, standard library only** | The harness runs Code Mode scripts with `python3`, and the MCP client it injects so sandbox code can call tools is itself a Python script. Python inside the sandbox is the grain of the tool, not a preference. Stdlib-only keeps `python3 scripts/probe_catalog.py` runnable by a judge with nothing installed, which is the claim the README opens with. |
| MCP server | **TypeScript on Node 22+**, `@modelcontextprotocol/sdk` ^1.29.0, `zod` for tool schemas | Node 22 is the harness's own `engines` floor. The SDK major matches the `mcp==1.29.0` the sandbox client pins, so both ends of Code Mode speak the same protocol version. Zod is what the harness validates its own specs with. |
| UI shell | **React 19, Vite**, `@truefoundry/trueforge-ui` 0.2.4 | The SDK's peer range is React 18 or 19 with `@assistant-ui/react` ^0.14.24. Vite because the shell is one page and a bundler is all it needs. |
| Storage | **Dated JSON under `data/runs/`, canonical**, mirrored into SQLite by the MCP server via `better-sqlite3` | The files are the audit record, are diffable in review, and replay with nothing installed. SQLite is a query index over them, and the harness already carries the same driver. |
| Python tooling | `ruff` for lint and format, `pytest` for tests | Dev dependencies only. The probe itself imports nothing outside the standard library and a test must not change that. |
| TypeScript tooling | `biome` for lint and format, `vitest` for tests, `tsc --noEmit` for types | One formatter, one test runner, across both TypeScript packages. |
| Repo | **npm workspaces** | A judge runs `npm install` with the Node they already have. No second package manager to install first. |

```
  casework/
  ├── scripts/probe_catalog.py       sandbox code, stdlib only: CLI, capture, report
  ├── scripts/detection.py           one feed, one observation
  ├── scripts/cases.py               triage, grouping, cause and party resolution
  ├── scripts/case_document.py       the machine-readable form of a run
  ├── scripts/catalog_query.py       catalog summary, or the rows asked for
  ├── data/runs/<date>.json          one capture per run, committed
  ├── packages/mcp/                  casework-mcp, TypeScript, stdio
  ├── packages/ui/                   React shell embedding the SDK
  ├── agent/casework.agent.json      AgentSpec: model, skills, mcp_servers, approval
  ├── skills/casework-sop/SKILL.md   registered with the harness skill store
  ├── tests/                         pytest over the triage and grouping rules
  ├── pyproject.toml                 dev tools only: ruff, pytest, pyright
  ├── package.json                   npm workspace over packages/*
  └── docs/SPEC.md
```

**Checks that run on every pull request**, so the Q Branch trail is a week of green runs rather
than one at the end: `ruff check`, `ruff format --check`, `pytest`, `biome ci`, `eslint`,
`tsc --noEmit` on both packages, `vitest run`, and the Qodo review itself. `npm run check` runs
all of them in one command, locally and in CI. The daily run capture is a local command while the repository has no remote;
it becomes a scheduled workflow the day it gets one.

**Why Code Mode is load-bearing and not decoration.** The catalog CSV alone is **1.12 MB**,
2,462 rows across 29 columns, and it is read in full to select 256 California feeds. Each feed
is then fetched with a range request, so the bodies add up to **512 KB** at the cap, on top of
256 header sets. None of that can usefully enter a context window, and none of it needs to: the
script computes in the sandbox and prints an **18-line report**. The ratio, roughly 1.6 MB in
and 18 lines out, is the sponsor's own argument about tool payloads compounding across turns,
and it is why the numbers in this document are cheap to re-measure. Remove Code Mode and the
model would have to read the catalog itself.

**Why the approval gate is honest here.** The gated action is a message to an outside
organization about their infrastructure. It cannot be unsent, it reaches a real third party,
and a wrong one costs the operator credibility. That is a genuine irreversible action rather
than a prompt in front of a shell command.

Being precise about what ships: **the transport is not wired for the demo**, so approving
writes the Decision, the trace and `data/outbox/<case_id>.eml`, and nothing leaves the machine.
The gate guards the seam where a transport would be configured, which is the only place it
could guard, and the video says exactly that. The design claim is that the boundary is in the
right place; it is not a claim that mail was sent.

## 5. The MCP server

`casework-mcp`, TypeScript, stdio. Tools:

| Tool | Reads/writes | Notes |
|---|---|---|
| `catalog.load(jurisdiction, feed_ids?)` | read | Reads the public catalog CSV in the sandbox. Without `feed_ids` it returns a **summary**: counts by status and authentication type, redirects, contacts on file, top hosts. With them it returns those rows: provider, url, auth type, **`status`, `redirect.id`**, contact presence. **Never returns contact addresses**, and never the 1.12 MB CSV. |
| `probe.run(jurisdiction, feed_ids?)` | read + capture | Delegates to the sandbox script, which fetches nothing but the catalog and the feeds and writes the run to `data/runs/<date>.json`. Returns detections only. `--no-capture` reports without writing, for a re-probe during attribution. |
| `cases.build(run_date?)` | write | Triage, clustering, cause resolution and run counts, then persistence. **Delegates to the sandbox** (`probe_catalog.py --replay <run> --json`) rather than reimplementing any of it, so the rules stay in the one module section 6 names. Fetches nothing. Idempotent per run date, because `case_id` is derived from `cause_key`. |
| `cases.list(state)` | read | Queue for the UI, suppressed rows included with their reason. |
| `evidence.get(case_id)` | read | Every observation backing a case, with timestamps. |
| `repo.inspect(host, path)` | read | GitHub API: does the repo exist, is it archived, when was it pushed, what paths exist. The attribution step for code-hosted feeds. |
| `tls.inspect(host)` | read | Opens one TLS connection and returns the certificate subject, issuer and expiry. The probe records only that a handshake failed; the certificate detail is collected here, at attribution time, for the same reason `repo.inspect` is. |
| `redirect.resolve(feed_id)` | read | Follows a catalog `redirect.id` to the replacement entry and probes it, so a suppressed row can prove the replacement is actually healthy. |
| `recipient.lookup(case_id)` | read | Returns the **kind** of recipient and whether an address is on file. Never the address. |
| `cases.attribute(case_id)` | write | Runs the investigation for the cause kind, writes what it read as evidence, records the party and a counted confidence. |
| `outreach.draft(case_id)` | write | Composes the message from the case and its evidence. Not gated. |
| `outreach.revise(case_id, subject, body)` | write | Stores an edited draft. The previous one is kept; the latest is what `send` reads. |
| `outreach.review(case_id)` | read | The current draft. |
| `outreach.decide(case_id, reject\|snooze)` | write | The human decisions that are not approvals. |
| **`outreach.send(case_id)`** | **write, external** | **Approval-gated. The only tool that leaves the building.** |

**Who the message is addressed to.** The catalog's `feed_contact_email` covers agencies, and
152 of the 256 California entries carry one. It does not cover the parties that actually own
these three causes: a repository owner, a hosting platform operator, a catalog maintainer. So
a **recipient registry** maps `party_kind` to a channel, in one committed file with no
addresses in it:

```
party_kind    cause_kind it serves                  resolver                          address source
repository    code_host_path_removed               GitHub owner in the cause_key     registry.local.json (never committed)
host_operator content_type_mismatch, auth_rejected, the failing host                  registry.local.json
              redirect_unresolved, host_unreachable
catalog       deprecated_service                   the catalog's own issue tracker   registry.local.json
cert_holder   tls_expired                          certificate subject from tls.inspect  registry.local.json
agency        path_not_found, individual           the feed's catalog entry          feed_contact_email, read at send time
```

Every `cause_kind` in section 6 maps to exactly one `party_kind` here, and the two enums are
checked against each other in the MCP schemas. A cause kind with no registry entry is a spec
bug, not a runtime fallback.

`recipient.lookup` returns `{party_kind, resolvable: true|false}` and nothing else. A case whose
recipient is not resolvable still reaches the queue and still shows its draft; it simply cannot
be approved, and the UI says which channel is missing. Addresses are read inside
`outreach.send`, at send time, and are never returned to the model, never logged, and never
rendered beyond "contact on file: yes/no".

**What `outreach.send` does in the demo.** It writes the Decision and the trace, renders the
message to `data/outbox/<case_id>.eml`, and returns. The transport is a seam: one function,
one interface, unimplemented on purpose, with the approval gate in front of it. The video says
this plainly rather than implying mail left the building.

## 6. Data model

```
Detection   run_date, observed_at, feed_id, provider, url, host, path,
            status_class, healthy, http_code, content_type, magic_ok, tls_ok,
            latency_ms, attempts, auth_type, catalog_status, redirect_id,
            contact_on_file

Suppression run_date, feed_id, reason, source(catalog_field|sop)

Case        case_id, cause_key, cause_kind, status_class, member_feed_ids[],
            corroborating_feed_ids[], agency_count, proposed_party, party_kind,
            confidence, first_seen, last_seen, consecutive_runs, state

Evidence    case_id, kind, observation, source_url, observed_at

Draft       case_id, subject, body, recipient_kind, generated_at

Decision    case_id, actor, action(approve|edit|reject|snooze), at, note
```

A case has two names. `case_id` is `sha1(cause_key)[:12]`, which the API, the agent and the URL
use. The **docket** is what a person uses: `CW-` and the case's rank by `first_seen`, then
`case_id`. `first_seen` is written once and never updated, so a docket survives tomorrow's run,
a reordering of the queue and a rebuild of the store from the run files. It is derived at read
time in `queueRow`, not stored, and it is never the row's position in today's queue: that sort
key includes `consecutive_runs`, which moves every run.

`cause_key` is `host|status_class`, except on a code host, where it is
`host/owner/repo|status_class`. One host serves many repositories and only a repository owner
can restore a path inside one, so the host alone is the wrong unit there. Every failure has a
`cause_key`, singletons included, because the 3-day rule in section 10 counts against that key
and there would otherwise be nothing to count for the fifteen individual failures.

`cause_kind` is one of `code_host_path_removed | deprecated_service | content_type_mismatch |
tls_expired | auth_rejected | path_not_found | redirect_unresolved | host_unreachable |
individual`. It is resolved per group, not per response, because the same 403 means a retired
service in one group and a host that started demanding credentials in another. Section 9 gives
the rule.

`status_class` is what one response looked like. `cause_kind` is what the group means. They are
different fields on purpose. The mapping lives in one module, `scripts/cases.py`: `CAUSE_KIND`
for the classes a single response settles, `resolve_cause()` for the ones only the group can.
An unrecognised class, which in practice means an `http_<code>` nobody has seen yet, resolves by
its HTTP family, and anything left over is `host_unreachable`. No status class is dropped and
none reaches a case without a kind.

Detections persist as one JSON file per run date under `data/runs/`, which is both the audit
record and the input to the run counter. A date holds exactly one file, the last run of that
date. The MCP server mirrors what it needs into `data/casework.sqlite`, which is derived,
gitignored and rebuildable from the run files by `cases.build`; the closed enums are repeated
there as CHECK constraints, so an unknown cause kind or state cannot reach a table even if a
tool schema is loosened later.

**Identity.** `case_id` is the first 12 hex characters of the SHA-1 of `cause_key`. It is
derived, not allocated, so the same cause is the same case tomorrow and `cases.build` is
idempotent by construction: rebuilding a run date updates one row per cause and can never
duplicate one. A Case therefore persists across runs and carries `first_seen`, `last_seen` and
`consecutive_runs`; the per-run facts stay in Detection.

**States.** A case is in exactly one of:

| State | Means | Leaves it when |
|---|---|---|
| `watching` | failing, under three consecutive runs | the count reaches three, or the cause stops failing |
| `ready` | three or more consecutive runs, draft generated, waiting on a human | a human acts on it |
| `snoozed` | a human deferred it to a date | the date passes, back to `ready` |
| `approved` | a human approved the draft, `outreach.send` ran | the cause fails again after resolving, which restarts it at `watching` |
| `rejected` | a human rejected it | same |
| `resolved` | the cause stopped failing | it fails again |

`consecutive_runs` resets to zero on `resolved`, so a cause that comes back waits three runs
again rather than inheriting last month's streak. An edit writes a new Draft row and keeps the
previous one; the latest is what `outreach.send` reads. A second approval on an already
approved case is refused by the MCP server, not by the UI.

**Confidence** is an integer from 0 to 3, and it is counted rather than estimated. One point if
`cause_kind` resolved to something other than the `host_unreachable` fallback; one if the group
has two or more actionable members or any corroborating ones; one if the attribution step
returned evidence naming the party. The UI shows it as low, medium or high, and 0 means
unattributed, which cannot be approved.

**Evidence** is a discriminated record, because a repository fact and a TLS fact are not the
same shape:

```
kind      fields
http      feed_id, url, status_class, http_code, content_type, magic_ok, observed_at
catalog   feed_id, field, value            e.g. status=deprecated, redirect.id=2684
repo      owner, repo, exists, archived, pushed_at, paths_present[]
redirect  from_feed_id, to_feed_id, replacement_status_class
tls       host, subject, issuer, not_after
```

**The attribution subagent** takes a `case_id` and the case's detections, may call
`repo.inspect`, `tls.inspect`, `redirect.resolve` and `probe.run(..., no_capture=true)`, and
must return `{party_kind, confidence_points[], evidence[]}` and nothing else. It never drafts
and never sends. If it fails, times out, or returns a `party_kind` the recipient registry does
not know, the case stays unattributed at confidence 0 and reaches the queue that way. One
subagent per case, and its result is written once.

**Closed enums.** `cause_kind`, `party_kind`, `state`, Decision `action` and the suppression
reasons are closed lists, defined here and enforced in the MCP tool schemas and the SQLite
constraints. Adding a value is a spec change, not a runtime surprise.

## 7. Classification and triage

Two passes. The first reads the response and nothing else. The second reads what the catalog
already declares about the entry. Keeping them apart is what lets the queue show a suppressed
row with a reason instead of quietly dropping it.

**Pass one, the response.** In order, first match wins.

1. Transport failed (DNS, connection reset, timeout) → `dns_failure | timeout | network`.
2. TLS chain invalid → `tls_expired`. The probe records the failure only; the certificate
   subject, issuer and expiry are read later by `tls.inspect`, since a classifier that opened a
   second connection per feed would be doing attribution's job.
3. HTTP 401/403 **and** catalog declares `authentication_type != 0` → `auth_declared`, healthy.
4. HTTP 401/403 otherwise → `auth_rejected`.
5. HTTP 404 → `not_found`.
6. Any other HTTP error → `http_<code>`.
7. A response arrived, so the status is 2xx, and the first two bytes are `PK` → healthy.
8. A response arrived and the content type is `text/*` or `application/json`, or the bytes are
   not a zip → `content_type_mismatch` / `not_a_zip`.

Every request carries `Range: bytes=0-2047`, so a served feed answers **206, not 200**: 182 of
the 256 responses in the committed run are 206. The classifier never reads the success code,
only the bytes and the content type, which is why a 206 of HTML is caught and a 200 of HTML
would be too.

Transport failures, and only those, get a second attempt before the class is recorded. Two is
the maximum, enforced by the CLI rather than left to a flag: a 404 does not become a 206 on a
retry, and retrying every failure would double a 256-feed run for nothing.

**Pass two, the catalog.** Each failure carries a suppression reason or none.

| Catalog state | Reason recorded | Count on 2026-08-24 |
|---|---|---|
| `authentication_type != 0`, response 401/403 | credential is required, feed is healthy | 7 |
| `status` is `deprecated` or `inactive`, `redirect.id` present | the catalog already re-points this entry | 20 |
| `status` is `deprecated` or `inactive`, no redirect | retired, no replacement recorded, a catalog gap rather than a feed fault | 0 |
| `status` is `development` | pre-production entry | 5 |

These two rules are what earn the tool's place: 32 of the 60 failing-looking responses are
already answered somewhere the analyst would have had to look by hand. A suppressed row is
never silently dropped; it appears in the queue, greyed, with its reason and the catalog field
behind it.

The two suppressions differ in one way that matters. A **credential** suppression says the feed
is healthy, so it is not a failure and never corroborates one; those seven rows are excluded
from grouping entirely. A **catalog-state** suppression says the entry is retired or not yet
live, which leaves the failure real and the ticket wrong, so those rows do corroborate their
cause under section 8.

## 8. Grouping

Two failures share a cause when they share a `cause_key`, which is the host and the
`status_class`, plus the owner and repository when the host is a code host. That is the whole
rule, and it is deliberately dumb, because the interesting work is the next step.

Guards, so the grouping cannot flatter itself:

- One actionable failure alone is not a case. It is an individual failure and goes through the
  3-day rule.
- One actionable failure **with suppressed siblings on the same `cause_key`** is a case. Six
  retired `transitfeeds.com` entries are evidence about the host, not noise, and a lone
  survivor pointing at a dead service is not the transient flap the 3-day rule exists to
  filter.
- Suppressed members are counted separately from actionable ones and never inflate the agency
  count on the queue row.
- Two agencies behind the same CDN with different `status_class` values do not group.
- The 12 California feeds on `raw.githubusercontent.com` all belong to one repository, so the
  repository is not doing work in this dataset. Across the whole catalog, not just the California
  slice the run covers, that host serves 24 feeds belonging to 12 distinct repositories, which is
  why the key carries it. That count is from the catalog CSV, not from the committed run.
- A group is recorded with its member count so the UI can show what was collapsed.

Measured behaviour on the 2026-08-24 run: 13 actionable failures grouped into 3 cases, **15
remained individual**, spread across 15 different hosts. The grouping is not merging
indiscriminately, and the singletons are the evidence for that.

## 9. Attribution

Grouping says these failed together. Attribution says whose problem it is. This is where the
subagents work and where the product stops being a link checker.

First, the cause kind is resolved for the group as a whole, because a single response cannot
tell these apart. In order:

1. **Half or more of the group's members, suppressed ones included, are marked retired in the
   catalog** and the class is a 401/403, 404 or transport failure → `deprecated_service`. The
   catalog retiring most of a host's entries is the strongest available statement that the host
   is gone, and it is data rather than a hardcoded list of dead services.
2. `not_found` on a code host → `code_host_path_removed`.
3. An HTTP 3xx the client would not follow → `redirect_unresolved`.
4. Otherwise the `status_class` maps straight through: content mismatch, TLS, auth, DNS,
   timeout, network.

Then the party. The probe proposes one from the cause kind alone, in a field called
`proposed_party`, and that proposal is what the queue shows before investigation. The subagent
either confirms it with evidence or replaces it. Nothing is drafted against a proposal: a case
reaches `ready` only with a `party_kind` the registry knows and evidence naming it.

| Cause kind | Investigation | Responsible party |
|---|---|---|
| `code_host_path_removed` | `repo.inspect`: does the repo exist, is it archived, last push, which paths are present now | `repository`. **The repository owner**, never the agencies. If the repo is alive and the paths are gone, the message asks whether they moved or whether the catalog should be re-pointed. |
| `content_type_mismatch` | Fetch once more, record content type and byte prefix | `host_operator`. The platform is serving the wrong thing under a `.zip` URL. |
| `deprecated_service` | `redirect.resolve` on the retired siblings: are their replacements healthy, and does the surviving entry have one | `catalog`, action is re-point. Contacting the agencies is the wrong move. |
| `tls_expired` | `tls.inspect`: certificate subject, issuer and expiry | `cert_holder`, which is usually a vendor and not the agency. |
| `redirect_unresolved` / `host_unreachable` | Re-fetch, record the redirect chain or the transport error | `host_operator`. |
| `path_not_found` | 404 on a host that is otherwise serving | `agency`, and the subagent reassigns to `host_operator` when the host is not the agency's own. |
| `individual` | None until the 3-day rule fires | `agency`, and only then. |

Confidence is recorded per case and the UI shows it. A case the agent cannot attribute stays
in the queue as unattributed rather than guessing a recipient, and so does a case whose
`recipient.lookup` cannot resolve a channel.

## 10. Suppression, the 3-day rule

State persists across runs. A `cause_key` seen failing on fewer than three consecutive runs is
a **candidate cause**: it appears in the queue with its run counter and produces **no draft and
no ticket**. The 18 in section 1 are candidate causes, counted against the 53 tickets a per-feed
view would open on the same data. On the first run none of them is drafted, and the queue says
so.
This is the operator's real SOP and it is the single most important reason the tool would be
adopted rather than muted.

The counter is computed from the dated files in `data/runs/`, not from a mutable counter
column. Each prior run contributes the set of `cause_key`s that were failing and actionable in
it; the streak is how many consecutive files, ending with the current one, contain the key.
This is why every failure has a `cause_key` even when it is a singleton, and why the rule
applies uniformly to the 15 individual failures and the 3 cases.

**It counts runs on file, not calendar days.** A day with no run breaks nothing and fakes
nothing: the streak simply does not advance. A missed day is visible as a missing file rather
than as a silently continued count.

The first run is committed on **2026-08-24**, the day the window opened, and one run is
captured on each subsequent day. By the 08-30 video there are seven files, so a case can
honestly reach day 7 of 3 and the counter is history rather than a prop. **The number of run
files on disk is shown on screen next to the counter.** On the 08-24 run every cause sits at
day 1 of 3 and nothing is drafted, which is the correct behaviour on a first run and is worth
showing rather than hiding.

## 11. Interface

Two screens, in a docked layout: the queue and case routes hold the main pane, the agent's
chat is docked beside them. `@truefoundry/trueforge-ui` is an assistant-ui chat shell with
themed atoms, swappable slots and a layout set (`DockLayout`, `SidebarLayout`, `WidgetLayout`),
not a general application framework, so the division of labour is fixed here rather than left
to the week:

- **The screens are ordinary React routes** in the shell, reading the queue and case through a
  narrow HTTP read API over the same store (`packages/mcp/src/entrypoints/http.ts`). They own the layout, the drill-down and the
  URL, because "every number is clickable" and "link a judge to a case" are both routing
  problems and neither survives being regenerated by a model on each turn.
- **OpenUI is used where generation is the point**: the agent's in-chat case summary and the
  approval prompt, built from the vocabulary the harness exposes (`Stack`, `Card`, `Table`,
  `Tabs`, `Accordion`, `Button`, `Form`, `Input`, `Select`). Approving there is a real tool
  call, gated by the harness, so approve means approve rather than a UI state a backend has to
  be told about afterwards.
- **The action bar in the case route dispatches to the agent**, which is what raises the
  harness's approval prompt in the docked pane. One path to `outreach.send`, not two. The read
  API has no send route at all: it answers `405` and says where approval happens, so a UI
  cannot POST its way past the gate and make it decorative.
- Approve is rendered disabled with the reason next to it: the run count, the missing
  attribution, the missing channel or the missing draft, whichever is blocking.

**Queue.** Cases ranked by actionable agency count. Each row: docket, cause kind, host or
repository, agency count, corroborating count, responsible party, confidence, day counter,
state. The docket is the row's link, so a case can be opened in a tab and pasted into a ticket.
Above the register, four state filters (all, watching, ready, decided) and a text find over
docket, cause, host and party.

Only grouped causes are in the register. Single-feed failures are apparatus: one collapsed
block below it, opened by a filter that matches one. Fifteen rows carrying one agency and no
siblings repeat the same five values and bury the grouped causes the page exists to show.

The totals strip carries the in-scope population only, in the order it subtracts: checked,
healthy, failing, answered by the catalog, actionable. The declared-credential feeds are named
in a sentence beneath it rather than added as a sixth figure, because they are filtered out
before `checked` is counted and would not subtract.

A suppressed section shows what was deliberately not raised, with the reason and the catalog
field that justifies it. A healthy count. The screen never shows a list of feeds.

**Case.** Four blocks: what the catalog asks for, what is actually there, attribution with its
evidence, and the draft. One action bar: approve and send, edit, reject, snooze. Approve is
disabled, with the reason shown, when the recipient channel is unresolvable. Redraft and reject
arm before they act: the first click changes the label and says what the second click will do,
because redraft discards a revised message and reject cannot be undone from this screen.

Design rule for the whole UI: **every number is clickable through to the observation that
produced it**, including the suppressed counts, which resolve to the catalog row and field that
suppressed them. Nothing on screen is a summary the user has to trust.

## 12. Demo

Three minutes, four beats, one fixture, no staging. Counts are restated from the run captured
on the day, not from this document.

1. **The queue.** 249 checked, 196 healthy, 53 failing, 25 of those already answered by the
   catalog, 28 actionable, **18 candidate causes against the 53 tickets a per-feed view opens**.
   State the collapse.
2. **Open the LACMTA case.** Seven agencies, all 404, plus four siblings the catalog has
   already re-pointed. The repository is alive and was pushed the day before. The directories
   the catalog references are not there. Attribution flips from seven cities to one repository
   owner. This is the beat the submission rests on.
3. **The suppressed block.** Seven feeds returned 401 and are healthy because the catalog says
   they need a key; 20 more are retired with a replacement already named, and five are marked
   pre-production. A naive checker opens 32 tickets that should not exist. This is the negative
   control, and it is the larger half of the number the dashboard shows.
4. **Approve one message.** The gate holds, the trace records who approved what, and the
   message lands in the outbox rather than in anybody's inbox. Say so out loud.

**Negative controls, all real, none planted:** the 15 singletons that must not group, the 7
credential-suppressed feeds, the 25 catalog-suppressed ones, and the 196 healthy feeds that
produce nothing at all.

**Fallback.** The probe output is captured as JSON per run. If an upstream host is slow or
down during judging, the same run replays from capture and the transformation is unchanged.
The video says which mode is running.

## 13. Build plan

Sized in files and lines, not in time. Calendar days are the event's, not an effort estimate.

| Day | Deliverable | Size |
|---|---|---|
| 08-24 | Licence, AI-use disclosure in README, `probe_catalog.py` with catalog triage, cause resolution, grouping, run counter and replay, first real run committed, npm workspace and both lint and test toolchains green, 15 tests over the triage and grouping rules | ~450 LOC, 12 files |
| 08-25 | Public remote, **Qodo installed on the first PR**, CI running `npm run check`. Landed early on 08-24: `casework-mcp` over stdio with `catalog.load`, `probe.run`, `cases.build`, `cases.list`, `evidence.get` and `recipient.lookup`, SQLite persistence with the case state machine, the recipient registry with no addresses in it, and 17 tests including an end-to-end MCP round trip | ~900 LOC, 14 files |
| 08-26 | Landed early: `repo.inspect`, `tls.inspect`, `redirect.resolve`, per-case attribution with counted confidence. Still to do: the second and third captured runs, which only time can produce | ~350 LOC, 4 files |
| 08-27 | Landed early: agent definition validated against the harness's own `AgentSpecSchema`, `casework-sop/SKILL.md`, draft generation. Still to do: registering the skill with a running harness, and the per-case subagent prompt | ~250 LOC, 4 files |
| 08-28 | Landed early: read API, queue and case screens, per section 11. Still to do: docking the agent chat beside them, which needs a running harness | ~600 LOC, 9 files |
| 08-29 | Landed early: the approval gate's refusals, the outbox seam, decisions and traces, `--replay`, README setup and CI. Still to do: the video | ~200 LOC, 4 files |
| 08-30 | Video, written summary, final Qodo pass. **Submit by 20:00 London.** | |

**Every day also captures a run**, before anything else, because the 3-day counter cannot be
backfilled honestly and a missed day is permanently missing.

Every day ends with a pull request reviewed by Qodo. The Q Branch track is judged on the
review trail across the week, so a single PR at the end forfeits it, and so does the first
commit landing straight on `main`.

## 14. What is proven and what is not

**Proven, measured 2026-08-24 on live public endpoints by the committed script**, with the run
itself committed at `data/runs/2026-08-24.json` and re-checkable offline with `--replay`. The
249/196/53 counts and the 25 the catalog had already answered. The three cases and their member
agencies. The 15 singletons across 15 hosts. The 7 credential-suppressed feeds, six on
`api.511.org` and one on `api.actransit.org`, and the catalog field that justifies suppressing
them. The 20 retired entries that each already name a replacement. `gtfs.calitp.org` returning
`text/html` under a `.zip` URL for five production entries, at HTTP 206.

**Read from the public GitHub API on 2026-08-24, not from the run.** The LACMTA repository being
public, unarchived, pushed 2026-08-23, and containing three agency directories where the catalog
references eleven. `repo.inspect` re-reads all four during attribution.

**Read from the catalog CSV, not from the California run.** That `raw.githubusercontent.com`
serves 24 feeds across 12 distinct repositories catalog-wide.

**Proven about the harness**, read from the published packages rather than from documentation:
per-tool approval selectors, a local sandbox provider, name-only skill references resolved from
a skill store, and the OpenUI component vocabulary in section 11.

**Not proven.**

- **At most two attempts per feed, at one moment, and only on transport failures.** A real run repeats
  across days before concluding, which is exactly why the 3-day rule exists. The single-run
  numbers are a snapshot, and two runs an hour apart differed by four feeds on the healthy
  count.
- **Grouping is a heuristic.** The singletons show it is not over-merging on this data. That is
  evidence, not proof.
- **Cross-run stability is an observation, not an artifact.** Runs on 2026-08-24 produced the
  same three cases every time, and the last two agreed on the status class of all 256 feeds, but
  a date holds one file so the repository cannot show that. From 08-25 the dated files can.
- **The 3-day rule has never fired.** On the committed run every cause sits at run 1 of 3 and
  nothing is drafted. The counter is tested against seeded history, not against a real streak,
  until 08-26.
- **`confidence` is counted, not calibrated.** The three points are defined in section 6 and are
  reproducible, but nobody has checked that a 3 is right more often than a 2.
- **The repository component of the cause key is untested on real conflicts.** All 12 California
  entries on `raw.githubusercontent.com` belong to one repository, so the key's extra precision
  changes nothing here. It is justified by the catalog-wide count of 12 distinct repositories on
  that host, not by a collision this dataset produced.
- **`deprecated_service` is inferred from catalog state, not from an end-of-life notice.** The
  rule fires when half or more of a group is already retired. On this data that is one host and
  it is correct. It has not been tested against a host where the catalog is merely behind.
- **Attribution correctness is asserted per case, not measured.** There is no ground truth
  set. The mitigation is that every attribution carries its evidence and a human approves.
- **Nobody has agreed to use this.** The problem evidence is first-party and public. The
  demand evidence is not, and this document does not claim it.

## 15. Risks

| Risk | Mitigation |
|---|---|
| A judge collapses this to "alert correlation" | Say it first, in the README and the video. The grouping primitive is commodity. The wedge is attributing a fault to an external organization and drafting the request to them, which no correlation platform does. |
| Upstream hosts flap during judging | Captured runs replay with `--replay`; the mode and the run date are stated on screen |
| The 3-day rule cannot be seeded honestly | Capture a run every day from 08-24. The counter reads the files on disk, so it cannot claim a day that was not run, and the file count is shown next to it |
| A judge asks why 53 became 28 and hears "we filtered until it looked good" | Every suppressed row is on screen with the catalog field and value that suppressed it, and `--replay` reproduces the same numbers offline from the committed run |
| The catalog's own `status` field is stale for a given entry | Suppression by catalog state is visible, reversible per row, and never deletes a detection. A stale `deprecated` hides a real fault, which is a known cost stated here rather than a surprise |
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
