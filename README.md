# Casework

An agent that works a transit data steward's feed-failure queue: it groups failures by shared
root cause, attributes each cause to the party who can actually fix it, drafts the outreach,
and stops for human approval before any message leaves.

Built on [TrueForge](https://github.com/truefoundry/trueforge) for the Agent Harness Hackathon
(2026-08-24 to 2026-08-30).

Status: the probe, the MCP server, attribution, the drafts, the gate and the screens all run.
The agent that drives them needs a TrueForge harness you supply. See
[`docs/SPEC.md`](docs/SPEC.md).

## Why

Spec validators answer "is this feed well formed". Scorecards answer "is it fresh". Alert
correlation platforms group *your* alerts, in *your* topology, for *your* team. None of them
answers the question the person on rotation actually has: how many problems is this really,
and who do I write to?

Run the probe against California's public GTFS feeds and the answer is not what the dashboard
shows:

```
  replay 2026-08-26, 2 prior run(s) on file
  checked 249   healthy 196   failing 53
  suppressed: 7 declare a credential, 24 the catalog has already retired or not yet shipped
  actionable failures 29

    7 agencies  raw.githubusercontent.com/LACMTA/los-angeles-regiona code_host_path_removed -> repository     run 3/3
      +4 corroborating: catalog already re-points this entry
    5 agencies  gtfs.calitp.org                                      content_type_mismatch  -> host_operator  run 3/3
      +5 corroborating: catalog marks this entry pre-production
      +1 corroborating: catalog already re-points this entry
    1 agency    transitfeeds.com                                     deprecated_service     -> catalog        run 3/3
      +6 corroborating: catalog already re-points this entry

  grouped 13 failures into 3 cases; 16 individual
  candidate causes 19, against 53 tickets a per-feed view would open
  past the 3-day rule, so drafted: 16
```

The 2026-08-24 and 2026-08-25 runs give the same three causes at the same sizes. All three
files are committed, so you can check that yourself. The counter reads 3/3 because it counts
those three files; there is no stored streak to fake, and until the third one landed nothing
could be drafted at all.

Those seven agencies are dark because a single repository that hosts GTFS on their behalf was
reorganised and the paths the catalog references are gone. Writing to seven city halls would be
seven wrong emails. None of them controls that repository.

The other 25 failures are not tickets, and the catalog says so itself. It marks 20 of them
`deprecated`, each already naming its replacement feed, and five `development`, three of those
under `/test/`. A further seven feeds return 401 and are perfectly healthy, because the catalog
records that they need an API key. A checker that reads only the HTTP response opens 32 tickets
that should not exist.

## Try it

```bash
python3 scripts/probe_catalog.py --jurisdiction California
```

No credentials, no API key, nothing to install. It reads the public
[Mobility Database](https://mobilitydatabase.org) catalog and the feed URLs as published, then
writes the run to `data/runs/<date>.json`. To replay a captured run offline, fetching nothing:

```bash
python3 scripts/probe_catalog.py --replay data/runs/2026-08-26.json
```

The 3-day rule counts the files in `data/runs/`, so the day counter is real history. A day
without a run leaves a gap in the dates and the counter does not move.

## Run the whole thing

Node 22+, Python 3.11+, and [uv](https://docs.astral.sh/uv/) for the Python dev tools. None of
it needs a credential to reach public data.

```bash
npm install && uv sync
cp registry.example.json registry.local.json   # who each party kind is written to

# 1. Capture a run. Writes data/runs/<date>.json. Skip it to work from the committed runs.
npm run capture

# 2. Build the cases and attribute them. Replays the runs on file; fetches no feeds.
npm run queue

# 3. The read API the screens are built on.
npm run api            # http://localhost:8791/api/queue

# 4. The queue and case screens.
npm run ui             # http://localhost:5273
```

`registry.local.json` maps a party kind to a channel. It is the only file that ever holds an
address, it is gitignored, and `outreach.send` reads it at send time and nowhere else. The
example ships `.invalid` placeholders, so you can run the whole path without writing to
anybody. Skip the copy and every case reads as having no channel and cannot be approved, which
is what should happen.

Step 2 attributes as well as groups. A case with no attribution has no party to write to, and
the queue row says so. Attribution reads the GitHub API and re-probes replacement feeds, so it
is the one step that touches the network after a run is captured.

The agent runs on TrueForge and needs three more things: a model FQN from the TrueFoundry
gateway, the `casework-sop` skill registered with the harness skill store, and `casework-mcp`
registered as an MCP server (`npm run start -w @casework/mcp`). Point
`VITE_CASEWORK_HARNESS_URL` at the harness API root and its chat mounts in the dock beside the
screens; leave it unset and the dock tells you what to set. See
[`agent/README.md`](agent/README.md).

`outreach.send` is the only approval-gated tool. No transport is wired, so approving writes the
message to `data/outbox/` and nothing leaves the machine.

## Working on it

Node 22+ for the TypeScript packages, Python 3.11+ for the probe, [uv](https://docs.astral.sh/uv/)
for the Python dev tools. The probe itself needs none of them.

```bash
npm install          # workspace: packages/mcp, packages/ui
uv sync              # ruff, pytest, pyright
npm run check        # biome, eslint, tsc, vitest, ruff, pytest
```

Layout and the rules that govern changes are in [`CLAUDE.md`](CLAUDE.md); the build design is
[`docs/SPEC.md`](docs/SPEC.md).

## What this is not

Alert correlation is a mature commercial category, and the grouping step here is its commodity
part. This project is about the step after it: attributing a fault to an organization outside
your own, and drafting the request to them.

Casework does not validate feeds. Free tools own that job and it consumes their verdict. It
does not touch GTFS-Realtime or WZDx, and it does not edit anybody's data.

## Qodo Code Review Evidence

Every pull request in this repository is reviewed by
[Qodo](https://github.com/marketplace/qodo-merge-pro), and the review is public.

[**PR #2**](https://github.com/sneg55/casework/pull/2) is the fullest example. Qodo returned
three correctness bugs, all of them real, all of them mine:

- **Transport evidence misreported.** `investigateTransport` and `investigateContent` re-probe
  through the same code, so their evidence carries the same `http` kind. The case page could
  not tell them apart and described an unreachable host as one that "served no archive", which
  answers a question nobody asked. It now branches on `cause_kind`.
- **Mixed results misreported.** The archive count and the phrase "the rest" were computed over
  different populations, so a partially healthy host could be told that "the rest answered
  application/zip" above a quoted `PK` and a line explaining that a zip archive begins `PK`.
- **Resolved cases called decided.** The store marks a case `resolved` on its own when it stops
  appearing in a run. The empty Ready tab called that a decision, crediting a steward with a
  call they never made.

The re-review then raised a rule violation worth more than the bugs: `auth_rejected` was routed
through the transport investigation while section 9 of [`docs/SPEC.md`](docs/SPEC.md) documented
that investigation for two cause kinds only. The gap was older than the pull request. Section 6
declares nine cause kinds and the section 9 table covered eight. The spec now carries the row,
and a test fails the build if the two ever disagree again.

Two of the repository's own tests had been asserting the buggy strings and were corrected
alongside the code. One passed on a substring while the sentence it covered was nonsense, which
is how the second bug survived to review in the first place.

Qodo runs automatically when a pull request is opened. It is also invoked with `/review` on a
pull request that predates the app.

## AI assistant disclosure

The event rules require this. The project was built with AI coding tools. I have reviewed and
understood the design decisions, the evidence behind them, and the code as submitted.

## Licence

MIT.
