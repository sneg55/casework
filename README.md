# Casework

An agent that works a transit data steward's feed-failure queue: it groups failures by shared
root cause, attributes each cause to the party who can actually fix it, drafts the outreach,
and stops for human approval before any message leaves.

Built on [TrueForge](https://github.com/truefoundry/trueforge) for the Agent Harness Hackathon
(2026-08-24 to 2026-08-30).

**Status: spec + probe. Not yet a running agent.** See [`docs/SPEC.md`](docs/SPEC.md).

## Why

Spec validators answer "is this feed well formed". Scorecards answer "is it fresh". Alert
correlation platforms group *your* alerts, in *your* topology, for *your* team. None of them
answer the question the person on rotation actually has: how many problems is this really,
and who do I write to?

Run the probe against California's public GTFS feeds and the answer is not what the dashboard
shows:

```
  live run 2026-08-24, 0 prior run(s) on file
  checked 249   healthy 196   failing 53
  suppressed: 7 declare a credential, 25 the catalog has already retired or not yet shipped
  actionable failures 28

    7 agencies  raw.githubusercontent.com/LACMTA/los-angeles-regiona code_host_path_removed -> repository     run 1/3
      +4 corroborating: catalog already re-points this entry
    5 agencies  gtfs.calitp.org                                      content_type_mismatch  -> host_operator  run 1/3
      +5 corroborating: catalog marks this entry pre-production
      +1 corroborating: catalog already re-points this entry
    1 agency    transitfeeds.com                                     deprecated_service     -> catalog        run 1/3
      +6 corroborating: catalog already re-points this entry

  grouped 13 failures into 3 cases; 15 individual
  candidate causes 18, against 53 tickets a per-feed view would open
  past the 3-day rule, so drafted: 0
```

Those seven agencies are dark because a single repository that hosts GTFS on their behalf was
reorganised and the paths the catalog references are gone. Writing to seven city halls would be
seven wrong emails. None of them controls that repository.

Of the other 25 failures, none is a ticket at all, and the catalog says so itself. It marks 20
of them `deprecated`, each already naming its replacement feed, and five `development`, three of
those under `/test/`. A further seven feeds return 401 and are perfectly healthy, because the
catalog records that they need an API key. A checker that reads only the HTTP response opens 32
tickets that should not exist.

## Try it

```bash
python3 scripts/probe_catalog.py --jurisdiction California
```

No credentials, no API key, no install. Reads the public
[Mobility Database](https://mobilitydatabase.org) catalog and the feed URLs as published, and
writes the run to `data/runs/<date>.json`. Replay a captured run offline, fetching nothing:

```bash
python3 scripts/probe_catalog.py --replay data/runs/2026-08-24.json
```

Runs on file are what the 3-day rule counts, so the day counter is history rather than a
staged prop.

## Run the whole thing

Four processes, none of which needs a credential to reach public data. Node 22+, Python 3.11+,
and [uv](https://docs.astral.sh/uv/) for the Python dev tools.

```bash
npm install && uv sync

# 1. Capture a run. Writes data/runs/<date>.json.
python3 scripts/probe_catalog.py --jurisdiction California

# 2. Build the cases for it. Fetches nothing; replays the captured run.
npm run build:cases -w @casework/mcp

# 3. The read API the screens are built on.
npm run api -w @casework/mcp          # http://localhost:8791/api/queue

# 4. The queue and case screens.
npm run dev -w @casework/ui           # http://localhost:5273
```

The agent itself runs on TrueForge and needs three more things: a model FQN from the
TrueFoundry gateway, the `casework-sop` skill registered with the harness skill store, and
`casework-mcp` registered as an MCP server (`npm run start -w @casework/mcp`). See
[`agent/README.md`](agent/README.md). `outreach.send` is the only approval-gated tool, and no
transport is wired: approving writes the message to `data/outbox/` and nothing leaves the
machine.

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

Alert correlation is a mature commercial category and the grouping step here is the commodity
part. What is not commodity, and what this project is actually about, is attributing a fault
to an **external organization** and drafting the request to them.

This project does not validate feeds (free tools own that, and it consumes their verdict), does
not touch GTFS-Realtime or WZDx, and does not edit anybody's data.

## AI assistant disclosure

Per the event rules: this project is developed with the assistance of AI coding tools. All
design decisions, the evidence behind them, and the code as submitted are reviewed and
understood by the author.

## Licence

MIT.
