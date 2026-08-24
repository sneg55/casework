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
| Of those, entries the catalog itself has already retired or not yet shipped | **25** |
| Actionable failures | **28** |
| Actionable failures that collapse into 3 shared causes | 13 |
| Genuinely individual failures | 15 |
| Tickets a per-feed view produces | 53 |
| Tickets a root-cause view produces | **18** |

Reproduce with `python3 scripts/probe_catalog.py`, which writes `data/runs/<date>.json` and
replays any captured run with `--replay`. **The three clusters are stable across runs; the
healthy and singleton counts are not.** Two runs an hour apart on 2026-08-24 gave 196 healthy
and 192, with the same three clusters at the same sizes both times. That spread is transient
upstream flakiness, and it is the reason the SOP in section 10 waits three days before acting
on a single-agency failure.

Of the fifty-three, twenty-five deserve their own line, because they are the difference between
a tool an analyst trusts and one they mute. The catalog carries a `status` field and a
`redirect.id` field. **The catalog marks 20 of the failing entries `deprecated`, and every one
of them already names its replacement feed.** A further five are marked `development`, two of
which are literally `gtfs.calitp.org/test/TestFlex1.zip`. None of the twenty-five is a ticket,
and a checker that reads only the HTTP response cannot know that.

The three shared causes, all verified by direct fetch:

1. **`LACMTA/los-angeles-regional-gtfs` on `raw.githubusercontent.com`, 7 agencies, HTTP 404.**
   All of them point into a single repository, whose own description reads "LA Metro is hosting
   GTFS data on behalf of various regional agencies". The repository is **public, not archived,
   and was pushed 2026-08-23**. It currently contains three agency directories. The catalog
   references eleven directories that are no longer present, and it has already re-pointed four
   of those eleven elsewhere, which leaves **seven live entries dark and four that corroborate
   the cause rather than dilute it**. This is not an outage. It is a repository reorganization,
   and none of the seven agencies controls the repository or can restore a path inside it.
2. **`gtfs.calitp.org`, 5 agencies, HTTP 200.** The URL ends `.zip` and the response is
   `Content-Type: text/html`. A status check passes. A content check does not. A further six
   entries on the same host share the symptom and are suppressed: five are `development`, one
   is already re-pointed.
3. **`transitfeeds.com`, 1 agency, HTTP 403.** A retired third-party feed service. The catalog
   already marks six of its seven entries `deprecated` with a replacement recorded. The
   seventh is not, and that single unretired entry is the whole case: the action is to record
   a replacement in the catalog, not to contact an agency. **This is a case on one member
   because six retired siblings prove the host is gone**, and it is the clearest example in
   the dataset of the catalog's own state doing attribution work.

And the control that matters as much as any of them: **seven feeds on `api.511.org` returned
HTTP 401 and are healthy.** The catalog marks them `authentication_type = 1`. A naive checker
opens seven tickets against seven agencies for feeds that are working correctly.

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
- **A model is required**, as `model.name` in FQN form. The README states which model the demo
  was run against and which provider key a judge needs. Nothing else in the design depends on
  the choice.

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
| `catalog.load(jurisdiction)` | read | Fetches the public catalog CSV, returns rows with provider, url, auth type, **`status`, `redirect.id`**, and contact presence. **Never returns contact addresses.** |
| `probe.run(feed_ids[])` | read | Delegates to the sandbox script. Returns detections only. |
| `cases.build(run_date)` | write | Triage, clustering, cause resolution, day counts. Idempotent per run date. |
| `cases.list(state)` | read | Queue for the UI, suppressed rows included with their reason. |
| `evidence.get(case_id)` | read | Every observation backing a case, with timestamps. |
| `repo.inspect(host, path)` | read | GitHub API: does the repo exist, is it archived, when was it pushed, what paths exist. The attribution step for code-hosted feeds. |
| `redirect.resolve(feed_id)` | read | Follows a catalog `redirect.id` to the replacement entry and probes it, so a suppressed row can prove the replacement is actually healthy. |
| `recipient.lookup(case_id)` | read | Returns the **kind** of recipient and whether an address is on file. Never the address. |
| `outreach.draft(case_id)` | write | Produces the message. Not gated. |
| **`outreach.send(case_id)`** | **write, external** | **Approval-gated. The only tool that leaves the building.** |

**Who the message is addressed to.** The catalog's `feed_contact_email` covers agencies, and
152 of the 256 California entries carry one. It does not cover the parties that actually own
these three causes: a repository owner, a hosting platform operator, a catalog maintainer. So
a **recipient registry** maps `responsible_party` to a channel, in one committed file with no
addresses in it:

```
party_kind      resolver                                    address source
repository      GitHub owner of the repo in the cause_key   registry.local.json (not committed)
host_operator   the failing host                            registry.local.json
catalog         the catalog's own issue tracker             registry.local.json
agency          catalog feed_contact_email for the feed     resolved from the CSV at send time
```

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

Case        case_id, run_date, cause_key, cause_kind, status_class,
            member_feed_ids[], corroborating_feed_ids[], agency_count,
            responsible_party, confidence, consecutive_runs, state

Evidence    case_id, kind, observation, source_url, observed_at

Draft       case_id, subject, body, recipient_kind, generated_at

Decision    case_id, actor, action(approve|edit|reject|snooze), at, note
```

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
different fields on purpose, and the mapping between them lives in `resolve_cause()` in
`scripts/probe_catalog.py`, which is the single place either can change.

Detections persist as one JSON file per run date under `data/runs/`, which is both the audit
record and the input to the day counter. The MCP server mirrors them into the harness's SQLite
for querying; the files stay canonical so a run can be replayed with nothing else installed.

## 7. Classification and triage

Two passes. The first reads the response and nothing else. The second reads what the catalog
already declares about the entry. Keeping them apart is what lets the queue show a suppressed
row with a reason instead of quietly dropping it.

**Pass one, the response.** In order, first match wins.

1. Transport failed (DNS, connection reset, timeout) → `dns_failure | timeout | network`.
2. TLS chain invalid → `tls_expired`, evidence carries the certificate subject and expiry.
3. HTTP 401/403 **and** catalog declares `authentication_type != 0` → `auth_declared`, healthy.
4. HTTP 401/403 otherwise → `auth_rejected`.
5. HTTP 404 → `not_found`.
6. Any other HTTP error → `http_<code>`.
7. HTTP 200 and first two bytes are `PK` → healthy.
8. HTTP 200 and content type is `text/*` or `application/json`, or the bytes are not a zip →
   `content_type_mismatch` / `not_a_zip`.

Transport failures, and only those, are retried once before the class is recorded. A 404 does
not become a 200 on a second attempt, and retrying every failure would double a 249-feed run
for nothing.

**Pass two, the catalog.** Each failure carries a suppression reason or none.

| Catalog state | Reason recorded | Count on 2026-08-24 |
|---|---|---|
| `authentication_type != 0`, response 401/403 | credential is required, feed is healthy | 7 |
| `status` is `deprecated` or `inactive`, `redirect.id` present | the catalog already re-points this entry | 20 |
| `status` is `deprecated` or `inactive`, no redirect | retired, no replacement recorded, a catalog gap rather than a feed fault | 0 |
| `status` is `development` | pre-production entry | 5 |

These two rules are what earn the tool's place: 32 of the 60 failing-looking feeds are already
answered somewhere the analyst would have had to look by hand. A suppressed row is never
silently dropped. It appears in the queue, greyed, with its reason, and it still contributes to
its cause as corroboration under section 8.

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
  repository is not doing work in this dataset. Catalog-wide, that same host serves 12 distinct
  repositories, which is why the key carries it.
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

Then the party:

| Cause kind | Investigation | Responsible party |
|---|---|---|
| `code_host_path_removed` | `repo.inspect`: does the repo exist, is it archived, last push, which paths are present now | **The repository owner**, never the agencies. If the repo is alive and the paths are gone, the message asks whether they moved or whether the catalog should be re-pointed. |
| `content_type_mismatch` | Fetch once more, record content type and byte prefix | **The host operator.** The platform is serving the wrong thing under a `.zip` URL. |
| `deprecated_service` | `redirect.resolve` on the retired siblings: are their replacements healthy, and does the surviving entry have one | **The catalog**, action is re-point. Contacting the agencies is the wrong move. |
| `tls_expired` | Read the certificate subject and expiry | **The certificate holder**, which is usually a vendor and not the agency. |
| `redirect_unresolved` / `host_unreachable` | Re-fetch, record the redirect chain or the transport error | **The host operator.** |
| `path_not_found` | 404 on a host that is otherwise serving | **The feed publisher**, which is the agency only when the host is the agency's own. |
| `individual` | None until the 3-day rule fires | The agency, and only then. |

Confidence is recorded per case and the UI shows it. A case the agent cannot attribute stays
in the queue as unattributed rather than guessing a recipient, and so does a case whose
`recipient.lookup` cannot resolve a channel.

## 10. Suppression, the 3-day rule

State persists across runs. A `cause_key` seen failing on fewer than three consecutive runs
produces **no draft and no ticket**, and appears in the queue greyed out with a day counter.
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

Two screens. `@truefoundry/trueforge-ui` is an assistant-ui chat shell with themed atoms,
swappable slots and a layout set, not a general application framework, so the split is:

- **The shell** is a small React app embedding the SDK, with the project's own theme, and it
  owns routing so a case has a URL a judge can be linked to.
- **The screens** are emitted by the agent as OpenUI blocks, the harness's generative-UI
  surface, whose component vocabulary is `Stack`, `Card`, `Table`, `Tabs`, `Accordion`,
  `Button`, `Form`, `Input`, `Select`. Queue and case both fall inside that vocabulary, and
  the buttons drive the agent's own tools, which is what makes approve mean approve rather
  than a UI state change that a backend then has to be told about.
- If a screen turns out not to fit the vocabulary, it moves into the shell as a normal React
  route reading `cases.list` through the MCP server. The fallback costs layout, not data.

**Queue.** Cases ranked by actionable agency count. Each row: cause kind, host or repository,
agency count, corroborating count, responsible party, confidence, day counter, state. A
suppressed section showing what was deliberately not raised, with the reason and the catalog
field that justifies it. A healthy count. The screen never shows a list of feeds.

**Case.** Four blocks: what the catalog asks for, what is actually there, attribution with its
evidence, and the draft. One action bar: approve and send, edit, reject, snooze. Approve is
disabled, with the reason shown, when the recipient channel is unresolvable.

Design rule for the whole UI: **every number is clickable through to the observation that
produced it**, including the suppressed counts, which resolve to the catalog row and field that
suppressed them. Nothing on screen is a summary the user has to trust.

## 12. Demo

Three minutes, four beats, one fixture, no staging. Counts are restated from the run captured
on the day, not from this document.

1. **The queue.** 249 checked, 196 healthy, 53 failing, 25 of those already answered by the
   catalog, 28 actionable, **18 tickets against 53**. State the collapse.
2. **Open the LACMTA case.** Seven agencies, all 404, plus four siblings the catalog has
   already re-pointed. The repository is alive and was pushed the day before. The directories
   the catalog references are not there. Attribution flips from seven cities to one repository
   owner. This is the beat the submission rests on.
3. **The suppressed block.** Seven feeds returned 401 and are healthy because the catalog says
   they need a key; 20 more are retired with a replacement already named. A naive checker opens
   27 tickets that should not exist. This is the negative control, and it is the larger half of
   the number the dashboard shows.
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
| 08-24 | Public remote, licence, **Qodo installed on the first PR**, AI-use disclosure in README, `probe_catalog.py` with catalog triage, cause resolution, grouping, day counter and replay, first real run committed | ~300 LOC, 5 files |
| 08-25 | `casework-mcp` skeleton, catalog and probe tools, Detection and Case persistence, recipient registry with no addresses in it | ~350 LOC, 6 files |
| 08-26 | `repo.inspect`, `redirect.resolve`, per-case attribution and confidence, the second and third captured runs | ~300 LOC, 4 files |
| 08-27 | Agent definition, `casework-sop/SKILL.md` registered with the harness skill store, subagent per case, draft generation | ~200 LOC, 3 files |
| 08-28 | UI: shell plus queue and case screens, per section 11 | ~450 LOC, 8 files |
| 08-29 | Approval gate end to end, outbox transport seam, traces, fallback replay, README with setup a judge can actually run | ~150 LOC, 3 files |
| 08-30 | Video, written summary, final Qodo pass. **Submit by 20:00 London.** | |

**Every day also captures a run**, before anything else, because the 3-day counter cannot be
backfilled honestly and a missed day is permanently missing.

Every day ends with a pull request reviewed by Qodo. The Q Branch track is judged on the
review trail across the week, so a single PR at the end forfeits it, and so does the first
commit landing straight on `main`.

## 14. What is proven and what is not

**Proven, measured 2026-08-24 on live public endpoints by the committed script**, with the run
itself committed at `data/runs/2026-08-24.json`. The 249/196/53 counts and the 25 the catalog
had already answered. The three cases and their member agencies, stable across two runs. The 15
singletons across 15 hosts. The 7 suppressed 511 feeds and the catalog field that justifies
suppressing them. The 20 retired entries that each already name a replacement. The LACMTA
repository being public, unarchived, pushed 2026-08-23, and containing three agency directories
where the catalog references eleven. `gtfs.calitp.org` returning `text/html` under a `.zip` URL
for five production entries.

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
