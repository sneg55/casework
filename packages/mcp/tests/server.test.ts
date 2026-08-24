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
  await call('cases.build')
})

/** The first case in the queue, which on the committed run is the LACMTA one. */
async function firstCaseId(): Promise<string> {
  const queue = z
    .object({ cases: z.array(z.object({ case_id: z.string() })) })
    .parse(await call('cases.list'))
  return queue.cases[0]?.case_id ?? ''
}

afterAll(async () => {
  await client.close()
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('casework-mcp', () => {
  it('offers every tool the spec names, and marks exactly one as leaving the building', async () => {
    const tools = (await client.listTools()).tools
    expect(tools.map((t) => t.name).sort()).toEqual([
      'cases.attribute',
      'cases.build',
      'cases.list',
      'catalog.load',
      'evidence.get',
      'outreach.decide',
      'outreach.draft',
      'outreach.review',
      'outreach.revise',
      'outreach.send',
      'probe.run',
      'recipient.lookup',
      'redirect.resolve',
      'repo.inspect',
      'tls.inspect',
    ])
    const destructive = tools.filter((t) => t.annotations?.destructiveHint === true)
    expect(destructive.map((t) => t.name)).toEqual(['outreach.send'])
  })

  it('refuses to send a case that has not cleared the three-run rule', async () => {
    const refusal = z
      .object({ refused: z.string() })
      .parse(await call('outreach.send', { case_id: await firstCaseId() }))
    expect(refusal.refused).toContain('3-day rule')
  })

  it('refuses to send an attributed, drafted case with no channel on file', async () => {
    const caseId = await firstCaseId()
    // Fast-forward the counter the way three more captured runs would.
    store.db.prepare('UPDATE cases SET consecutive_runs = 3').run()
    store.db.prepare("UPDATE cases SET party_kind = 'repository' WHERE case_id = ?").run(caseId)
    await call('outreach.draft', { case_id: caseId })
    const refusal = z
      .object({ refused: z.string() })
      .parse(await call('outreach.send', { case_id: caseId }))
    expect(refusal.refused).toContain('no channel on file')
    expect(store.getCase(caseId)?.state).not.toBe('approved')
  })

  it('drafts a message that carries the observations and no address', async () => {
    const caseId = await firstCaseId()
    const draft = z
      .object({ subject: z.string(), body: z.string(), recipient_kind: z.string() })
      .parse(await call('outreach.draft', { case_id: caseId }))
    expect(draft.recipient_kind).toBe('repository')
    expect(draft.subject).toContain('404')
    expect(draft.body).toContain('raw.githubusercontent.com/LACMTA')
    expect(draft.body).not.toMatch(/[\w.]+@[\w.]+/)
  })

  it('keeps the previous draft when one is revised', async () => {
    const caseId = await firstCaseId()
    await call('outreach.revise', { case_id: caseId, subject: 'Edited', body: 'Shorter.' })
    const current = z
      .object({ subject: z.string() })
      .parse(await call('outreach.review', { case_id: caseId }))
    expect(current.subject).toBe('Edited')
    const kept = store.db
      .prepare('SELECT COUNT(*) AS n FROM drafts WHERE case_id = ?')
      .get(caseId) as { n: number }
    expect(kept.n).toBeGreaterThan(1)
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
    const caseId = await firstCaseId()
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
    const lookup = z
      .object({ party_kind: z.string(), resolvable: z.boolean() })
      .parse(await call('recipient.lookup', { case_id: await firstCaseId() }))
    expect(lookup.party_kind).toBe('repository')
    expect(lookup.resolvable).toBe(false)
  })
})
