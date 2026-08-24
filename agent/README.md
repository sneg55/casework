# Running the agent

The agent definition is `casework.agent.json`, in the shape TrueForge's `AgentSpecSchema`
validates. Three things have to be true before it runs:

1. **The model name is a placeholder.** Replace `truefoundry/casework-model` with the FQN your
   TrueFoundry gateway exposes. Nothing else in the design depends on the choice.
2. **The skill has to be registered.** `skills` references `casework-sop` by name only; the
   mount comes from the harness's skill store, so `skills/casework-sop/` has to be added there.
   Committing it to this repository is not enough.
3. **The MCP server has to be registered** under the name `casework`, running
   `npm run start -w @casework/mcp` from the repository root.

`require_approval_for_tools` names `outreach.send` explicitly rather than using the `@write` or
`@destructive` selector, so adding a write tool later cannot silently widen the gate.
