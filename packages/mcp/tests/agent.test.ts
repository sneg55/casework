// The agent definition is validated against the harness's own schema rather than against a
// copy of it, so a TrueForge upgrade that changes the shape fails here and not in the demo.
import { readFileSync } from 'node:fs'

import { AgentSpecSchema } from '@truefoundry/trueforge-core/agent-session'
import { describe, expect, it } from 'vitest'

const spec: unknown = JSON.parse(readFileSync('agent/casework.agent.json', 'utf8'))

describe('the agent definition', () => {
  it('satisfies the harness AgentSpecSchema', () => {
    expect(() => AgentSpecSchema.parse(spec)).not.toThrow()
  })

  it('gates outreach.send by name, not by a selector that could widen', () => {
    const parsed = AgentSpecSchema.parse(spec)
    const server = parsed.mcp_servers?.[0]
    expect(server?.require_approval_for_tools).toEqual(['outreach.send'])
  })

  it('turns on the harness features the design depends on', () => {
    const parsed = AgentSpecSchema.parse(spec)
    expect(parsed.config.sandbox.enabled).toBe(true)
    expect(parsed.config.dynamic_sub_agents.enabled).toBe(true)
    expect(parsed.config.generative_ui.enabled).toBe(true)
    expect(parsed.skills?.map((s) => s.name)).toEqual(['casework-sop'])
  })
})
