#!/usr/bin/env node
// The read API the queue and case routes are built on. Deliberately narrow: it can read the
// store and it can draft, revise, reject and snooze. It cannot send. Approval goes through
// the agent, where the harness gate lives, and a UI that could POST its way past that gate
// would make the gate decorative.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { caseView, queueRow } from '../features/cases/view.js'
import { draftFor, latestDraft, reviseDraft } from '../features/outreach/draft.js'
import { decide } from '../features/outreach/send.js'
import { latestRunDate, runDates } from '../services/runFiles.js'
import { openStore, type Store } from '../services/store.js'
import { env } from '../utils/env.js'

const store = openStore(env.CASEWORK_DB)

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // A queue read must never come from a cache: the run, the state and the draft change
    // under the reader while the page is open.
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(body)
}

async function body(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
}

function queue(s: Store, state: string | null): unknown {
  const date = latestRunDate()
  if (date === undefined) return { run_date: null, run: null, cases: [] }
  const run = s.db.prepare<[string], unknown>('SELECT * FROM runs WHERE run_date = ?').get(date)
  const rows = s.listCases(state ?? undefined).map((row) => queueRow(s, row, date))
  const suppressed = s.db
    .prepare<[string], { reason: string; n: number }>(
      'SELECT reason, COUNT(*) AS n FROM suppressions WHERE run_date = ? GROUP BY reason',
    )
    .all(date)
  return { run_date: date, run, cases: rows, suppressed, runs_on_file: runDates() }
}

function detail(s: Store, caseId: string): unknown {
  const view = caseView(s, caseId)
  if (view === undefined) return null
  const evidence = s.db
    .prepare<[string], unknown>(
      'SELECT kind, observation, source_url, observed_at FROM evidence WHERE case_id = ?',
    )
    .all(caseId)
  const decisions = s.db
    .prepare<[string], unknown>(
      'SELECT actor, action, at, note FROM decisions WHERE case_id = ? ORDER BY at',
    )
    .all(caseId)
  return { ...view, attribution: evidence, draft: latestDraft(s, caseId) ?? null, decisions }
}

async function post(
  caseId: string,
  action: string | undefined,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const input = await body(req)
  switch (action) {
    case 'draft': {
      const draft = draftFor(store, caseId)
      return json(res, draft === undefined ? 404 : 200, draft ?? { error: 'no such case' })
    }
    case 'revise':
      return json(res, 200, reviseDraft(store, caseId, input['subject'] ?? '', input['body'] ?? ''))
    case 'decide':
      return json(res, 200, {
        ...decide(store, {
          caseId,
          action: input['action'] === 'snooze' ? 'snooze' : 'reject',
          actor: input['actor'] ?? 'analyst',
          note: input['note'],
          until: input['until'],
        }),
      })
    case 'send':
      return json(res, 405, {
        error:
          'Approval happens through the agent, where the harness gate is. This API cannot send.',
      })
    case undefined:
    default:
      return json(res, 404, { error: 'not found' })
  }
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const [root, resource, id, action] = url.pathname.split('/').filter((p) => p !== '')

  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (root !== 'api') return json(res, 404, { error: 'not found' })
  if (req.method === 'GET' && resource === 'queue') {
    return json(res, 200, queue(store, url.searchParams.get('state')))
  }
  if (req.method === 'GET' && resource === 'cases' && id !== undefined) {
    const view = detail(store, id)
    return json(res, view === null ? 404 : 200, view ?? { error: 'no such case' })
  }
  if (req.method === 'POST' && resource === 'cases' && id !== undefined) {
    return await post(id, action, req, res)
  }
  return json(res, 404, { error: 'not found' })
}

createServer((req, res) => {
  void route(req, res).catch((error: unknown) => {
    json(res, 500, { error: String(error) })
  })
}).listen(env.PORT, () => {
  process.stdout.write(`casework read API on http://localhost:${String(env.PORT)}/api/queue\n`)
})
