# Starter patterns - apply on touch

Apply these when already editing the relevant code. Never as a bulk refactor.

- Editing a file over 300 lines -> split per the file-size hook's suggestions
  (types / constants / validation / utils).
- Touching a `throw` / `raise` site -> route it through the error registry
  (`guides/error-id-registry.md`).
- Changing a fallible function's signature -> consider returning a Result
  (`guides/discriminated-union-results.md`).
- Touching an env read -> move it behind the env boundary
  (`guides/zod-at-the-boundary.md`).
- Adding a long-running operation -> thread cancellation through it
  (`guides/abort-signal-threading.md`).
- Adding a new tool -> use the directory-per-tool layout
  (`guides/tool-authoring-pattern.md`).

## Casework specifics

- `scripts/` is sandbox code and stays standard library only. A dependency there
  breaks the claim that a judge can run the probe with nothing installed.
- `data/runs/*.json` are captured evidence. Never reformat, edit or regenerate a
  past run to make a number agree with prose; fix the prose.
- No contact address enters this repository, a log line, a captured run, or the
  UI. `contact_on_file: true|false` is the most that may be recorded.
- `cause_kind`, `party_kind`, case `state` and Decision `action` are closed enums
  defined in `docs/SPEC.md` section 6. Adding a value is a spec change first.
