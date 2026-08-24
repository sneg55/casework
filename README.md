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
  checked 249   healthy 196   failing 53
  suppressed (catalog declares a key is required, feeds are healthy): 7

   11 agencies  raw.githubusercontent.com          not_found
   11 agencies  gtfs.calitp.org                    content_type_mismatch
    7 agencies  transitfeeds.com                   auth_rejected

  grouped 29 failures into 3 cases; 24 individual
  tickets: per-feed 53  ->  root-cause 27
```

Eleven of those agencies are dark because a single repository that hosts GTFS on their behalf
was reorganised and the paths the catalog references are gone. Eleven separate emails to
eleven city halls would be eleven wrong emails. None of them controls that repository.

Seven more feeds look broken and are perfectly healthy: the catalog already says they need an
API key. A checker that does not read that field opens seven false tickets.

## Try it

```bash
python3 scripts/probe_catalog.py --jurisdiction California
```

No credentials, no API key, no install. Reads the public
[Mobility Database](https://mobilitydatabase.org) catalog and the feed URLs as published.

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
