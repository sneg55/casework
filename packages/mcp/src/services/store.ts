// Persistence. The dated run files under data/runs stay canonical; this is the query
// index over them, plus the state a human puts on a case. Rebuilding a run date is
// idempotent because case_id is derived from cause_key, never allocated.
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import Database from 'better-sqlite3'

import { RUNS_BEFORE_DRAFT } from '../constants/enums.js'
import type { CaseDocument, CaseRecord } from '../schemas/caseDocument.js'
import { type CaseRow, caseRowSchema } from '../types/rows.js'
import { SCHEMA } from './schema.sql.js'

export type Store = ReturnType<typeof openStore>

/** Human decisions outlive a run; a rebuild must never quietly undo one. */
const HUMAN_STATES = new Set(['approved', 'rejected', 'snoozed'])

function nextState(previous: CaseRow | undefined, runs: number, today: string): string {
  if (!previous) return runs >= RUNS_BEFORE_DRAFT ? 'ready' : 'watching'
  if (previous.state === 'snoozed') {
    return previous.snoozed_until !== null && previous.snoozed_until <= today ? 'ready' : 'snoozed'
  }
  // A cause that stopped failing and came back starts its three runs again.
  if (runs === 1 && !HUMAN_STATES.has(previous.state)) return 'watching'
  if (HUMAN_STATES.has(previous.state)) return previous.state
  return runs >= RUNS_BEFORE_DRAFT ? 'ready' : 'watching'
}

export function openStore(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  const selectCase = db.prepare<[string], unknown>('SELECT * FROM cases WHERE case_id = ?')
  const upsertCase = db.prepare(`
    INSERT INTO cases (case_id, cause_key, cause_kind, status_class, proposed_party,
                       agency_count, consecutive_runs, state, first_seen, last_seen)
    VALUES (@case_id, @cause_key, @cause_kind, @status_class, @proposed_party,
            @agency_count, @consecutive_runs, @state, @seen, @seen)
    ON CONFLICT(case_id) DO UPDATE SET
      cause_kind = @cause_kind, status_class = @status_class,
      proposed_party = @proposed_party, agency_count = @agency_count,
      consecutive_runs = @consecutive_runs, state = @state, last_seen = @seen`)
  const clearMembers = db.prepare('DELETE FROM case_members WHERE case_id = ? AND run_date = ?')
  const insertMember = db.prepare(`
    INSERT INTO case_members (case_id, run_date, feed_id, role, reason)
    VALUES (?, ?, ?, ?, ?)`)
  const insertSuppression = db.prepare(`
    INSERT OR REPLACE INTO suppressions (run_date, feed_id, cause_key, reason)
    VALUES (?, ?, ?, ?)`)
  const insertRun = db.prepare(`
    INSERT OR REPLACE INTO runs (run_date, prior_runs_on_file, checked, healthy, failing,
      suppressed_credential, suppressed_catalog, actionable, built_at)
    VALUES (@run_date, @prior, @checked, @healthy, @failing, @credential, @catalog,
            @actionable, @built_at)`)
  const resolveMissing = db.prepare(`
    UPDATE cases SET state = 'resolved', consecutive_runs = 0, last_seen = ?
    WHERE state IN ('watching', 'ready') AND case_id NOT IN (SELECT value FROM json_each(?))`)

  function readCase(caseId: string): CaseRow | undefined {
    const row = selectCase.get(caseId)
    return row === undefined ? undefined : caseRowSchema.parse(row)
  }

  function writeCase(record: CaseRecord, runDate: string): void {
    const state = nextState(readCase(record.case_id), record.consecutive_runs, runDate)
    upsertCase.run({
      case_id: record.case_id,
      cause_key: record.cause_key,
      cause_kind: record.cause_kind,
      status_class: record.status_class,
      proposed_party: record.proposed_party,
      agency_count: record.agency_count,
      consecutive_runs: record.consecutive_runs,
      state,
      seen: runDate,
    })
    clearMembers.run(record.case_id, runDate)
    for (const feedId of record.member_feed_ids) {
      insertMember.run(record.case_id, runDate, feedId, 'member', null)
    }
    for (const sibling of record.corroborating) {
      insertMember.run(record.case_id, runDate, sibling.feed_id, 'corroborating', sibling.reason)
    }
  }

  /** Idempotent per run date: the same document twice leaves the same rows. */
  const persist = db.transaction((doc: CaseDocument, builtAt: string) => {
    insertRun.run({
      run_date: doc.run_date,
      prior: doc.prior_runs_on_file,
      checked: doc.counts.checked,
      healthy: doc.counts.healthy,
      failing: doc.counts.failing,
      credential: doc.counts.suppressed_by_credential,
      catalog: doc.counts.suppressed_by_catalog,
      actionable: doc.counts.actionable,
      built_at: builtAt,
    })
    const present: string[] = []
    for (const record of [...doc.cases, ...doc.individual]) {
      writeCase(record, doc.run_date)
      present.push(record.case_id)
    }
    for (const item of doc.suppressed) {
      insertSuppression.run(doc.run_date, item.feed_id, item.cause_key, item.reason)
    }
    resolveMissing.run(doc.run_date, JSON.stringify(present))
    return present.length
  })

  return {
    db,
    persistRun(doc: CaseDocument, builtAt: string): number {
      return persist(doc, builtAt)
    },
    getCase: readCase,
    listCases(state?: string): CaseRow[] {
      const sql =
        'SELECT * FROM cases' +
        (state === undefined ? '' : ' WHERE state = @state') +
        ' ORDER BY agency_count DESC, consecutive_runs DESC, case_id'
      const rows =
        state === undefined
          ? db.prepare<[], unknown>(sql).all()
          : db.prepare<[string], unknown>(sql.replace('@state', '?')).all(state)
      return rows.map((row) => caseRowSchema.parse(row))
    },
    close(): void {
      db.close()
    },
  }
}
