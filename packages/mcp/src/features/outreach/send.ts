// The one tool that leaves the building, and the only irreversible thing the system does.
// The approval gate sits in front of it in the agent spec; this module is what it guards.
//
// The transport is deliberately not wired: approving writes the decision, the trace and an
// .eml file under data/outbox. Addresses are read here, at send time, and go into the file
// on disk. They are never returned to the model, never logged and never rendered.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { RUNS_BEFORE_DRAFT } from '../../constants/enums.js'
import type { Store } from '../../services/store.js'
import { env } from '../../utils/env.js'
import { caseView } from '../cases/view.js'
import { channelKey, loadRegistry } from '../recipients/registry.js'
import { latestDraft } from './draft.js'

export interface SendResult {
  case_id: string
  sent: false
  outbox_path: string
  recipient_kind: string
  transport: 'outbox'
  note: string
}

export type SendRefusal = { refused: string }

function address(caseKey: string, party: string): string | undefined {
  const channels = loadRegistry().get(party as never)
  return channels?.get(channelKey(caseKey)) ?? channels?.get('*')
}

/**
 * Refuses more often than it accepts, on purpose. A case has to be past the three-run rule,
 * attributed, drafted, not already acted on, and have a channel on file.
 */
export function sendCase(store: Store, caseId: string, actor: string): SendResult | SendRefusal {
  const row = store.getCase(caseId)
  if (row === undefined) return { refused: `no such case: ${caseId}` }
  if (row.state === 'approved') return { refused: 'this case was already approved' }
  if (row.state === 'rejected') return { refused: 'this case was rejected' }
  if (row.consecutive_runs < RUNS_BEFORE_DRAFT) {
    return {
      refused: `the 3-day rule has not fired: ${row.consecutive_runs} of ${RUNS_BEFORE_DRAFT} consecutive runs`,
    }
  }
  if (row.party_kind === null) {
    return { refused: 'unattributed: run cases.attribute before sending' }
  }
  const view = caseView(store, caseId)
  if (view?.recipient_resolvable !== true) {
    return { refused: `no channel on file for a ${row.party_kind}` }
  }
  const draft = latestDraft(store, caseId)
  if (draft === undefined) return { refused: 'no draft: run outreach.draft first' }

  const to = address(row.cause_key, row.party_kind)
  if (to === undefined) return { refused: `no channel on file for a ${row.party_kind}` }

  mkdirSync(env.CASEWORK_OUTBOX_DIR, { recursive: true })
  const path = join(env.CASEWORK_OUTBOX_DIR, `${caseId}.eml`)
  const at = new Date().toISOString()
  writeFileSync(
    path,
    [
      `To: ${to}`,
      `Subject: ${draft.subject}`,
      `X-Casework-Case: ${caseId}`,
      `X-Casework-Cause: ${row.cause_key}`,
      `Date: ${at}`,
      '',
      draft.body,
      '',
    ].join('\n'),
  )

  store.db
    .prepare('INSERT INTO decisions (case_id, actor, action, at, note) VALUES (?, ?, ?, ?, ?)')
    .run(caseId, actor, 'approve', at, `written to ${path}, transport not wired`)
  store.db.prepare("UPDATE cases SET state = 'approved' WHERE case_id = ?").run(caseId)

  return {
    case_id: caseId,
    sent: false,
    outbox_path: path,
    recipient_kind: row.party_kind,
    transport: 'outbox',
    note: 'The message was rendered to the outbox. No transport is configured, so nothing left this machine.',
  }
}

export interface DecisionInput {
  caseId: string
  action: 'reject' | 'snooze'
  actor: string
  note?: string | undefined
  until?: string | undefined
}

/**
 * A steward refused a send at the gate. The case does not move: refusing is not a decision
 * about the cause, it is a decision about this message, and the cause is still failing. But it
 * is recorded, because "nobody has acted on this case" is false the moment somebody says no.
 */
export function recordDenial(store: Store, caseId: string, actor: string, note?: string): void {
  store.db
    .prepare('INSERT INTO decisions (case_id, actor, action, at, note) VALUES (?, ?, ?, ?, ?)')
    .run(caseId, actor, 'deny', new Date().toISOString(), note ?? null)
}

export function decide(
  store: Store,
  input: DecisionInput,
): { case_id: string; state: string } | SendRefusal {
  const { caseId, action, actor } = input
  const row = store.getCase(caseId)
  if (row === undefined) return { refused: `no such case: ${caseId}` }
  const at = new Date().toISOString()
  store.db
    .prepare('INSERT INTO decisions (case_id, actor, action, at, note) VALUES (?, ?, ?, ?, ?)')
    .run(caseId, actor, action, at, input.note ?? null)
  if (action === 'reject') {
    store.db.prepare("UPDATE cases SET state = 'rejected' WHERE case_id = ?").run(caseId)
    return { case_id: caseId, state: 'rejected' }
  }
  store.db
    .prepare("UPDATE cases SET state = 'snoozed', snoozed_until = ? WHERE case_id = ?")
    .run(input.until ?? null, caseId)
  return { case_id: caseId, state: 'snoozed' }
}
