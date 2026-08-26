# Running the agent

The agent definition is `casework.agent.json`, in the shape TrueForge's `AgentSpecSchema`
validates. `packages/mcp/tests/agent.test.ts` parses it against that schema on every commit, so
a TrueForge upgrade that changes the shape fails the build rather than the demo.

## Local harness

TrueForge runs as a single process with SQLite behind it. Nothing else is required.

```bash
npx @truefoundry/trueforge      # http://localhost:8790
npm run mcp                     # casework-mcp over HTTP on :8792
npm run api                     # the read API on :8791
npm run ui                      # the screens on :5273
```

Then, in the harness at http://localhost:8790:

1. **Settings, Models.** Add a provider and its API key. Nothing runs without one, and the key
   is yours: it is entered in the harness, never in this repository.
2. **Settings, Connectors.** Add `casework` as a remote MCP server at
   `http://localhost:8792/mcp`. The harness only registers remote servers, which is why
   `npm run mcp` exists alongside the stdio entrypoint the spec describes.
3. **Settings, Skills.** Import `casework-sop` from this repository, path
   `skills/casework-sop`. The harness clones it from GitHub, so the copy it reads is the
   committed one.

Steps 2 and 3 are also `POST /api/v1/settings/mcp-servers` and `POST /api/v1/settings/skills`
against the harness, which is how they were registered here.

## Notes

`require_approval_for_tools` names `outreach.send` explicitly rather than using the `@write` or
`@destructive` selector, so adding a write tool later cannot silently widen the gate.

`VITE_CASEWORK_HARNESS_URL` is `/harness`, not the harness origin: the standalone harness sends
no CORS headers and 404s the preflight, so the UI reaches it through a Vite proxy pointed at
`CASEWORK_HARNESS_ORIGIN`.

The `model.name` in `casework.agent.json` is a placeholder. Replace it with a model id the
provider you configured actually exposes.
