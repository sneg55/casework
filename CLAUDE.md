# Project Instructions

## Memory System

You have a persistent, file-based memory system. Build it up over time so future conversations have a complete picture of who the user is, how they'd like to collaborate, what behaviors to avoid or repeat, and the context behind the work.

If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.

## Types of Memory

There are four discrete types. Only save information that is NOT derivable from the current project state (code, git history, file structure).

### user
**What it stores:** Information about the user's role, goals, responsibilities, and knowledge.
**When to save:** When you learn any details about the user's role, preferences, responsibilities, or knowledge.
**How to use:** Tailor your behavior to the user's profile. Collaborate with a senior engineer differently than a first-time coder. Frame explanations relative to their domain knowledge.

Examples:
- "I'm a data scientist investigating what logging we have in place" → save: user is a data scientist, currently focused on observability/logging
- "I've been writing Go for ten years but this is my first time touching the React side" → save: deep Go expertise, new to React - frame frontend explanations in terms of backend analogues

### feedback
**What it stores:** Guidance the user has given about how to approach work - both what to avoid AND what to keep doing.
**When to save:** Any time the user corrects your approach ("no not that", "don't", "stop doing X") OR confirms a non-obvious approach worked ("yes exactly", "perfect, keep doing that"). Corrections are easy to notice; confirmations are quieter - watch for them.
**How to use:** Let these memories guide your behavior so the user doesn't need to offer the same guidance twice.
**Structure:** Lead with the rule, then a **Why:** line and a **How to apply:** line. Knowing why lets you judge edge cases.

Examples:
- "don't mock the database in these tests - we got burned when mocked tests passed but prod migration failed" → save: integration tests must hit a real database. Why: mock/prod divergence masked a broken migration. How to apply: all test files in this repo use real DB connections.
- "stop summarizing what you just did, I can read the diff" → save: terse responses, no trailing summaries.
- "yeah the single bundled PR was the right call here" → save: for refactors, user prefers one bundled PR over many small ones. Confirmed approach - not a correction.

### project
**What it stores:** Information about ongoing work, goals, initiatives, bugs, or incidents NOT derivable from code or git history.
**When to save:** When you learn who is doing what, why, or by when. Always convert relative dates to absolute (e.g., "Thursday" → "2026-03-05").
**How to use:** Understand broader context behind the user's requests, anticipate coordination issues, make better suggestions.
**Structure:** Lead with the fact/decision, then **Why:** and **How to apply:** lines. Project memories decay fast - the why helps judge if they're still relevant.

Examples:
- "we're freezing all non-critical merges after Thursday" → save: merge freeze begins 2026-03-05 for mobile release cut. Flag non-critical PRs after that date.
- "ripping out old auth middleware because legal flagged session token storage" → save: auth rewrite driven by compliance, not tech debt - scope decisions should favor compliance over ergonomics.

### reference
**What it stores:** Pointers to where information lives in external systems.
**When to save:** When you learn about resources in external systems and their purpose.
**How to use:** When the user references an external system or you need external info.

Examples:
- "check Linear project INGEST for pipeline bugs" → save: pipeline bugs tracked in Linear project "INGEST"
- "grafana.internal/d/api-latency is what oncall watches" → save: latency dashboard - check when editing request-path code.

## What NOT to Save

- Code patterns, conventions, architecture, file paths, or project structure - derivable by reading the project
- Git history, recent changes, who-changed-what - `git log` / `git blame` are authoritative
- Debugging solutions or fix recipes - the fix is in the code, commit message has context
- Anything already documented in CLAUDE.md files
- Ephemeral task details: in-progress work, temporary state, current conversation context

These exclusions apply even when the user explicitly asks. If they ask to save a PR list or activity summary, ask what was *surprising* or *non-obvious* - that's the part worth keeping.

## Memory File Format

Each memory is its own `.md` file with YAML frontmatter:

```markdown
---
name: {{memory name}}
description: {{one-line description - be specific, used to decide relevance in future conversations}}
type: {{user, feedback, project, reference}}
---

{{memory content - for feedback/project types: rule/fact, then **Why:** and **How to apply:** lines}}
```

### Saving Process
1. Write the memory to its own file (e.g., `user_role.md`, `feedback_testing.md`)
2. Add a one-line pointer in `MEMORY.md`: `- [Title](file.md) - one-line hook`
3. Keep `MEMORY.md` under 200 lines - it's an index, not a dump

### Maintenance
- Keep name, description, and type fields up-to-date with content
- Organize semantically by topic, not chronologically
- Update or remove memories that are wrong or outdated
- Check for existing memories before writing duplicates

## When to Access Memories

- When memories seem relevant, or the user references prior-conversation work
- You MUST access memory when the user explicitly asks you to check, recall, or remember
- If the user says to *ignore* or *not use* memory: proceed as if MEMORY.md were empty

## Before Recommending from Memory

A memory that names a specific function, file, or flag is a claim that it existed *when written*. It may have been renamed, removed, or never merged. Before recommending:

- If the memory names a file path: check the file exists
- If the memory names a function or flag: grep for it
- If the user is about to act on your recommendation: verify first

"The memory says X exists" is not the same as "X exists now."

A memory that summarizes repo state is frozen in time. For *recent* or *current* state, prefer `git log` or reading the code over recalling the snapshot.

## Memory Consolidation (Dream)

Periodically review and consolidate memories:

### Phase 1 - Orient
- List the memory directory to see what exists
- Read MEMORY.md to understand the current index
- Skim existing topic files to improve rather than duplicate

### Phase 2 - Gather
- Check for new information worth persisting
- Look for existing memories that contradict current codebase state
- Search transcripts narrowly for specific context if needed

### Phase 3 - Consolidate
- Merge new signal into existing topic files (don't create near-duplicates)
- Convert relative dates to absolute dates
- Delete contradicted facts at the source

### Phase 4 - Prune
- Keep MEMORY.md under 200 lines / ~25KB
- Each index entry: one line, under ~150 chars: `- [Title](file.md) - one-line hook`
- Remove pointers to stale/superseded memories
- Resolve contradictions between files

---

## Git Safety

- Never force push
- Never skip hooks
- Never commit secrets
- Use heredoc syntax for multi-line commit messages

## Implementation Notes

While working a multi-step task against a spec, maintain a running `<spec>-implementation-notes.md` in the same folder as the spec (where `<spec>` is the spec file's base name). Capture anything the developer should know about how the implementation diverges from or interprets the spec:

- **Design decisions** - choices you made where the spec was ambiguous
- **Deviations** - places where you intentionally departed from the spec, and why
- **Tradeoffs** - alternatives you considered and why you picked what you did
- **Open questions** - anything you'd want the developer to confirm or revise

Append entries as decisions come up - don't reconstruct them at the end. Keep each entry short. This is a working document scoped to the task, not permanent docs: once the developer has reviewed it and the work is merged, the file can be deleted or archived.

## Self-improvement loop

This project captures its own signal and improves from it. You do not need to do
anything special during normal work - the loop runs around you.

- **Signal:** the enforcement hooks append a JSON event to `.harness/ledger.jsonl`
  every time one blocks or warns (file too large, lint failure, silent error,
  edit-before-read). The raw ledger is gitignored - it is local and noisy.
- **Reflect:** run `/reflect` periodically. It reads the ledger via
  `harness-ledger-stats.sh`, finds recurring `(rule, path-prefix)` clusters, reads
  your `feedback` memories, and proposes concrete changes - a new project rule
  below, a hook threshold tweak, a lint rule, or an ADR. Nothing is applied without
  your approval.
- **Measure:** each reflection writes `.harness/reflections/YYYY-MM-DD.md` with a
  metric snapshot (`recurring_events`). Compare across reflections to confirm a
  promoted rule actually reduced the mistakes it targeted.

Signal is private (gitignored ledger); wisdom is shared (committed reflections and
the rules they produce).

## Project-Specific Instructions

**Project:** casework
**Description:** An agent that works a transit data steward's feed-failure queue: it groups
failures by shared root cause, attributes each cause to the party who can actually fix it,
drafts the outreach, and stops for human approval before any message leaves.

The build design is `docs/SPEC.md` and it is the authority on layout, enums, states and
scope. Read the relevant section before changing behaviour, and change the spec in the same
commit when behaviour has to move.

### Layout

```
scripts/            sandbox code, Python 3.11+, standard library only
tests/              pytest, covers the triage and grouping rules
data/runs/          one captured run per date, committed, evidence for every count
packages/mcp/       casework-mcp, TypeScript on Node 22
packages/ui/        React shell, queue and case routes docked beside the agent chat
agent/              AgentSpec: model, skills, mcp_servers, approval
skills/casework-sop/  the SOP skill, registered with the harness skill store
```

The starter's `src/features/...` tree is deliberately not used at the repository root: the
workspace layout above comes from `docs/SPEC.md` section 4. Feature-based organisation
applies inside `packages/mcp/src`.

### Rules that are not negotiable here

- **No contact address** enters this repository, a log line, a captured run, or the UI.
  `contact_on_file: true|false` is the most that may be recorded. Addresses are read inside
  `outreach.send` at send time, from a file that is never committed.
- **`scripts/` stays standard library only.** A dependency there breaks the claim that a
  judge can run the probe with nothing installed.
- **A captured run is evidence.** Never reformat, edit or regenerate a past run to make a
  number agree with prose. Fix the prose, or capture a new run under today's date.
- **Capture a run every day** of the event window. The 3-day rule counts run files, and a
  missed day cannot be backfilled honestly.
- **`cause_kind`, `party_kind`, case `state` and Decision `action` are closed enums**, defined
  in section 6 of the spec. Adding a value is a spec change first.
- **Every number in the README and the spec comes from the committed run.** Anything measured
  elsewhere says where it came from.

### Checks

`npm run check` runs the lot: biome, eslint, tsc on both packages, vitest, ruff and pytest.
