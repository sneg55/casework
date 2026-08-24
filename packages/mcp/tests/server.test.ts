// End to end over a real MCP connection: build the committed run into a store, then read
// the queue and one case back through the tools an agent would call.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createServer } from '../src/server.js'
import { openStore, type Store } from '../src/services/store.js'

const textReply = z.object({ content: z.array(z.object({ type: z.string(), text: z.string() })) })

let client: Client
let store: Store
let dir: string

async function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const raw = await client.callTool({ name, arguments: args })
  const [first] = textReply.parse(raw).content
  return JSON.parse(first?.text ?? 'null')
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'casework-server-'))
  store = openStore(join(dir, 'casework.sqlite'))
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'test', version: '0' })
  await Promise.all([createServer(store).connect(serverSide), client.connect(clientSide)])
})

afterAll(async () => {
  await client.close()
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('casework-mcp', () => {
  it('offers the read tools and nothing that can send', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort()
    expect(names).toEqual([
      'cases.build',
      'cases.list',
      'catalog.load',
      'evidence.get',
      'probe.run',
      'recipient.lookup',
    ])
    expect(names).not.toContain('outreach.send')
  })

  it('builds the committed run and answers the queue with causes, not feeds', async () => {
    const built = z
      .object({ run_date: z.string(), cases_persisted: z.number() })
      .parse(await call('cases.build'))
    expect(built.run_date).toBe('2026-08-24')
    expect(built.cases_persisted).toBe(18)

    const queue = z
      .object({
        run_date: z.string(),
        cases: z.array(
          z.object({
            case_id: z.string(),
            cause_kind: z.string(),
            locator: z.string(),
            agency_count: z.number(),
            corroborating_count: z.number(),
            state: z.string(),
            consecutive_runs: z.number(),
            runs_needed: z.number(),
            recipient_resolvable: z.boolean(),
          }),
        ),
      })
      .parse(await call('cases.list'))

    expect(queue.cases).toHaveLength(18)
    const [first] = queue.cases
    expect(first?.cause_kind).toBe('code_host_path_removed')
    expect(first?.agency_count).toBe(7)
    expect(first?.corroborating_count).toBe(4)
    // First run of a cause: nothing is drafted, and the queue says how many runs are left.
    expect(first?.state).toBe('watching')
    expect(first?.runs_needed).toBe(2)
  })

  it('shows the evidence behind a case and never a contact address', async () => {
    const queue = z
      .object({ cases: z.array(z.object({ case_id: z.string() })) })
      .parse(await call('cases.list'))
    const caseId = queue.cases[0]?.case_id ?? ''
    const view = await call('evidence.get', { case_id: caseId })
    const parsed = z
      .object({
        cause_key: z.string(),
        members: z.array(z.object({ feed_id: z.string(), role: z.string() })),
        evidence: z.array(z.object({ kind: z.string() })),
      })
      .parse(view)

    expect(parsed.cause_key).toContain('LACMTA/los-angeles-regional-gtfs')
    expect(parsed.members).toHaveLength(11)
    expect(parsed.evidence.some((e) => e.kind === 'catalog')).toBe(true)
    expect(JSON.stringify(view)).not.toMatch(/[\w.]+@[\w.]+/)
  })

  it('reports a case as unattributed while no channel exists for its party', async () => {
    const queue = z
      .object({ cases: z.array(z.object({ case_id: z.string() })) })
      .parse(await call('cases.list'))
    const lookup = z
      .object({ party_kind: z.string(), resolvable: z.boolean() })
      .parse(await call('recipient.lookup', { case_id: queue.cases[0]?.case_id ?? '' }))
    expect(lookup.party_kind).toBe('repository')
    expect(lookup.resolvable).toBe(false)
  })
})
