#!/usr/bin/env node
// The read API the queue and case routes are built on. Deliberately narrow: it can read the
// store, draft, revise, reject and snooze, and relay a human's answer to a call the harness has
// suspended. It still cannot send: /api/cases/:id/send answers 405, and an approval is a
// user.tool_approval posted to the harness, which is the only thing that can resume the call.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { pending, relay } from '../features/approvals/harness.js'
import { caseView, queueRow } from '../features/cases/view.js'
import { isBucket, ledger } from '../features/evidence/ledger.js'
import { draftFor, latestDraft, reviseDraft } from '../features/outreach/draft.js'
import { decide, recordDenial } from '../features/outreach/send.js'
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
    // Named rather than wildcarded: POST /api/approvals releases a call the harness has
    // suspended, so any page in the browser must not be able to reach it.
    'Access-Control-Allow-Origin': env.CASEWORK_UI_ORIGIN,
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
      if (draft === undefined) return json(res, 404, { error: 'no such case' })
      // A refusal is the rule working, not a server fault: 409, with the reason to show.
      return 'refused' in draft ? json(res, 409, { error: draft.refused }) : json(res, 200, draft)
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

/** The rows behind one of the counts on the register. Section 11's clickable numbers. */
function ledgerRoute(res: ServerResponse, params: URLSearchParams): void {
  const date = latestRunDate()
  const bucket = params.get('bucket') ?? ''
  if (date === undefined) return json(res, 404, { error: 'no captured run' })
  if (!isBucket(bucket)) return json(res, 404, { error: `no such bucket: ${bucket}` })
  return json(res, 200, ledger(store, date, bucket, params.get('reason') ?? undefined))
}

function get(res: ServerResponse, url: URL, resource: string, id: string | undefined): void {
  if (resource === 'queue') return json(res, 200, queue(store, url.searchParams.get('state')))
  if (resource === 'ledger') return ledgerRoute(res, url.searchParams)
  if (resource === 'cases' && id !== undefined) {
    const view = detail(store, id)
    return json(res, view === null ? 404 : 200, view ?? { error: 'no such case' })
  }
  return json(res, 404, { error: 'not found' })
}

/**
 * The gates the harness is holding. An unreachable harness is reported as such rather than as
 * an empty list, because "nothing is waiting" and "I cannot see what is waiting" are different
 * answers and the screen says which one it got.
 */
async function approvals(res: ServerResponse): Promise<void> {
  try {
    const scan = await pending(env.CASEWORK_HARNESS_ORIGIN, env.CASEWORK_HARNESS_TOKEN)
    return json(res, 200, { harness: true, ...scan })
  } catch (error: unknown) {
    return json(res, 200, {
      harness: false,
      pending: [],
      complete: false,
      sessions_scanned: 0,
      sessions_total: 0,
      error: String(error),
    })
  }
}

/**
 * A steward approves the message they were shown. `outreach.send` reads the draft again when
 * the turn resumes, so a redraft between the two would send text nobody read. The client sends
 * back the draft it rendered and this refuses if it is no longer the current one.
 */
function draftMoved(caseId: string, seen: string | undefined): boolean {
  const current = latestDraft(store, caseId)
  if (current === undefined) return true
  return seen !== current.generated_at
}

/** Relay one answer. The suspended call belongs to the harness; this never sends anything. */
async function decideApproval(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const input = await body(req)
  const status = input['status']
  if (status !== 'allow' && status !== 'deny') {
    return json(res, 400, { error: 'status must be allow or deny' })
  }
  for (const key of ['session_id', 'thread_id', 'tool_call_id'] as const) {
    if (typeof input[key] !== 'string') return json(res, 400, { error: `${key} is required` })
  }

  let gate
  try {
    const scan = await pending(env.CASEWORK_HARNESS_ORIGIN, env.CASEWORK_HARNESS_TOKEN)
    gate = scan.pending.find(
      (g) => g.session_id === input['session_id'] && g.tool_call_id === input['tool_call_id'],
    )
  } catch (error: unknown) {
    return json(res, 502, { error: String(error) })
  }
  // An id the harness is not currently holding is not a decision, whoever sent it.
  if (gate === undefined) return json(res, 409, { error: 'that call is not waiting for an answer' })

  if (
    status === 'allow' &&
    gate.case_id !== null &&
    draftMoved(gate.case_id, input['draft_seen'])
  ) {
    return json(res, 409, {
      error: 'the draft changed since it was shown. Reload the case and read it again.',
    })
  }

  try {
    await relay(
      env.CASEWORK_HARNESS_ORIGIN,
      {
        session_id: gate.session_id,
        thread_id: gate.thread_id,
        tool_call_id: gate.tool_call_id,
        status,
        ...(input['reason'] === undefined ? {} : { reason: input['reason'] }),
      },
      env.CASEWORK_HARNESS_TOKEN,
    )
    return json(res, 200, { relayed: status })
  } catch (error: unknown) {
    return json(res, 502, { error: String(error) })
  } finally {
    // After the relay, and outside its catch. The harness has already taken the answer, so a
    // failure to write the local record must not be reported as a failure to deny.
    if (status === 'deny' && gate.case_id !== null) {
      try {
        recordDenial(store, gate.case_id, 'analyst', input['reason'])
      } catch (error: unknown) {
        process.stderr.write(`could not record the denial: ${String(error)}\n`)
      }
    }
  }
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const [root, resource, id, action] = url.pathname.split('/').filter((p) => p !== '')

  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (root !== 'api' || resource === undefined) return json(res, 404, { error: 'not found' })
  if (req.method === 'GET' && resource === 'approvals') return await approvals(res)
  if (req.method === 'GET') return get(res, url, resource, id)
  if (req.method === 'POST' && resource === 'approvals') return await decideApproval(req, res)
  if (req.method === 'POST' && resource === 'cases' && id !== undefined) {
    return await post(id, action, req, res)
  }
  return json(res, 404, { error: 'not found' })
}

createServer((req, res) => {
  void route(req, res).catch((error: unknown) => {
    json(res, 500, { error: String(error) })
  })
}).listen(env.CASEWORK_API_PORT, env.CASEWORK_API_HOST, () => {
  const where = `${env.CASEWORK_API_HOST}:${String(env.CASEWORK_API_PORT)}`
  process.stdout.write(`casework read API on http://${where}/api/queue\n`)
})
