// The queue and the case, shaped for a reader. Both are small on purpose: a queue row is
// a cause, not a feed, and the case view names its members rather than inlining a run.
import { RUNS_BEFORE_DRAFT } from '../../constants/enums.js'
import { detectionsFor, latestRunDate } from '../../services/runFiles.js'
import type { Store } from '../../services/store.js'
import { type CaseRow, type MemberRow, memberRowSchema } from '../../types/rows.js'
import { type Evidence, evidenceFor } from '../evidence/fromRun.js'
import { isResolvable, loadRegistry } from '../recipients/registry.js'
import { docketNumber } from './docket.js'

export interface QueueRow {
  case_id: string
  docket: string
  cause_kind: string
  locator: string
  agency_count: number
  corroborating_count: number
  party_kind: string
  recipient_resolvable: boolean
  confidence: number
  consecutive_runs: number
  runs_needed: number
  state: string
}

function members(store: Store, caseId: string, runDate: string): MemberRow[] {
  const rows = store.db
    .prepare<[string, string], unknown>(
      'SELECT feed_id, role, reason FROM case_members WHERE case_id = ? AND run_date = ?',
    )
    .all(caseId, runDate)
  return rows.map((row) => memberRowSchema.parse(row))
}

function contactOnFile(runDate: string, feedIds: readonly string[]): boolean {
  return detectionsFor(runDate, feedIds).some((d) => d.contact_on_file)
}

export function queueRow(store: Store, row: CaseRow, runDate: string): QueueRow {
  const all = members(store, row.case_id, runDate)
  const memberIds = all.filter((m) => m.role === 'member').map((m) => m.feed_id)
  const party = row.party_kind ?? row.proposed_party
  return {
    case_id: row.case_id,
    docket: docketNumber(store.rankOf(row.first_seen, row.case_id)),
    cause_kind: row.cause_kind,
    locator: row.cause_key.split('|')[0] ?? row.cause_key,
    agency_count: row.agency_count,
    corroborating_count: all.length - memberIds.length,
    party_kind: party,
    recipient_resolvable: isResolvable(
      loadRegistry(),
      party,
      row.cause_key,
      contactOnFile(runDate, memberIds),
    ),
    confidence: row.confidence,
    consecutive_runs: row.consecutive_runs,
    runs_needed: Math.max(0, RUNS_BEFORE_DRAFT - row.consecutive_runs),
    state: row.state,
  }
}

export interface CaseView extends QueueRow {
  cause_key: string
  status_class: string
  first_seen: string
  last_seen: string
  members: MemberRow[]
  evidence: Evidence[]
}

export function caseView(store: Store, caseId: string, runDate?: string): CaseView | undefined {
  const row = store.getCase(caseId)
  const date = runDate ?? latestRunDate()
  if (row === undefined || date === undefined) return undefined
  const all = members(store, row.case_id, date)
  return {
    ...queueRow(store, row, date),
    cause_key: row.cause_key,
    status_class: row.status_class,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    members: all,
    evidence: evidenceFor(
      detectionsFor(
        date,
        all.map((m) => m.feed_id),
      ),
    ),
  }
}
