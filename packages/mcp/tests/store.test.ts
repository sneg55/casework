// The state machine and the idempotence claim in docs/SPEC.md section 6.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { CaseDocument, CaseRecord } from '../src/schemas/caseDocument.js'
import { openStore, type Store } from '../src/services/store.js'

function record(over: Partial<CaseRecord> = {}): CaseRecord {
  return {
    case_id: '83d87fefd630',
    cause_key: 'example.org|not_found',
    cause_kind: 'path_not_found',
    status_class: 'not_found',
    proposed_party: 'agency',
    agency_count: 2,
    member_feed_ids: ['1', '2'],
    corroborating: [],
    consecutive_runs: 1,
    ...over,
  }
}

function document(runDate: string, cases: CaseRecord[]): CaseDocument {
  return {
    run_date: runDate,
    prior_runs_on_file: 0,
    counts: {
      checked: 249,
      healthy: 196,
      failing: 53,
      suppressed_by_credential: 7,
      suppressed_by_catalog: 25,
      actionable: 28,
    },
    cases,
    individual: [],
    suppressed: [],
  }
}

describe('the case store', () => {
  let dir: string
  let store: Store

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'casework-'))
    store = openStore(join(dir, 'db', 'casework.sqlite'))
  })

  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('is idempotent per run date', () => {
    const doc = document('2026-08-24', [record()])
    store.persistRun(doc, 'now')
    store.persistRun(doc, 'later')
    expect(store.listCases()).toHaveLength(1)
    const members = store.db.prepare('SELECT COUNT(*) AS n FROM case_members').get() as {
      n: number
    }
    expect(members.n).toBe(2)
  })

  it('waits three consecutive runs before a case is ready', () => {
    store.persistRun(document('2026-08-24', [record({ consecutive_runs: 1 })]), 'now')
    expect(store.getCase('83d87fefd630')?.state).toBe('watching')
    store.persistRun(document('2026-08-25', [record({ consecutive_runs: 2 })]), 'now')
    expect(store.getCase('83d87fefd630')?.state).toBe('watching')
    store.persistRun(document('2026-08-26', [record({ consecutive_runs: 3 })]), 'now')
    expect(store.getCase('83d87fefd630')?.state).toBe('ready')
  })

  it('keeps a human decision when the run is rebuilt', () => {
    store.persistRun(document('2026-08-24', [record({ consecutive_runs: 3 })]), 'now')
    store.db.prepare("UPDATE cases SET state = 'approved'").run()
    store.persistRun(document('2026-08-25', [record({ consecutive_runs: 4 })]), 'now')
    expect(store.getCase('83d87fefd630')?.state).toBe('approved')
  })

  it('resolves a case whose cause stopped failing', () => {
    store.persistRun(document('2026-08-24', [record({ consecutive_runs: 3 })]), 'now')
    store.persistRun(document('2026-08-25', []), 'now')
    const row = store.getCase('83d87fefd630')
    expect(row?.state).toBe('resolved')
    expect(row?.consecutive_runs).toBe(0)
  })

  it('restarts the count when a resolved cause comes back', () => {
    store.persistRun(document('2026-08-24', [record({ consecutive_runs: 3 })]), 'now')
    store.persistRun(document('2026-08-25', []), 'now')
    store.persistRun(document('2026-08-26', [record({ consecutive_runs: 1 })]), 'now')
    expect(store.getCase('83d87fefd630')?.state).toBe('watching')
  })

  it('refuses a cause kind that is not in the enum', () => {
    expect(() =>
      store.db
        .prepare(
          `INSERT INTO cases (case_id, cause_key, cause_kind, status_class, proposed_party,
             agency_count, consecutive_runs, state, first_seen, last_seen)
           VALUES ('x', 'k', 'invented_kind', 's', 'agency', 1, 1, 'watching', 'd', 'd')`,
        )
        .run(),
    ).toThrow()
  })
})
