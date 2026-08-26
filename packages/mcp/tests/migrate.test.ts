// A store built before a CHECK was widened must accept the new value after opening.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { openStore, type Store } from '../src/services/store.js'

let dir: string
let path: string
let store: Store

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'casework-migrate-'))
  path = join(dir, 'old.sqlite')
  // The schema as it stood before `deny` existed.
  const old = new Database(path)
  old.exec(`
    CREATE TABLE cases (case_id TEXT PRIMARY KEY, cause_key TEXT, cause_kind TEXT,
      status_class TEXT, proposed_party TEXT, agency_count INTEGER, consecutive_runs INTEGER,
      state TEXT, first_seen TEXT, last_seen TEXT, party_kind TEXT, confidence INTEGER,
      snoozed_until TEXT);
    CREATE TABLE decisions (
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      actor   TEXT NOT NULL,
      action  TEXT NOT NULL CHECK (action IN ('approve','edit','reject','snooze')),
      at      TEXT NOT NULL,
      note    TEXT);
    INSERT INTO cases (case_id, state) VALUES ('c1', 'ready');
    INSERT INTO decisions VALUES ('c1', 'analyst', 'reject', '2026-08-01T00:00:00Z', 'kept');
  `)
  old.close()
})

afterAll(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('migrate', () => {
  it('rejects the new action before the migration runs', () => {
    const raw = new Database(path)
    expect(() =>
      raw
        .prepare('INSERT INTO decisions VALUES (?, ?, ?, ?, ?)')
        .run('c1', 'analyst', 'deny', '2026-08-26T00:00:00Z', null),
    ).toThrow()
    raw.close()
  })

  it('accepts it after opening the store, and keeps the rows that were there', () => {
    store = openStore(path)
    store.db
      .prepare('INSERT INTO decisions VALUES (?, ?, ?, ?, ?)')
      .run('c1', 'analyst', 'deny', '2026-08-26T00:00:00Z', 'refused at the gate')

    const rows = store.db.prepare('SELECT action, note FROM decisions ORDER BY at').all() as {
      action: string
      note: string | null
    }[]
    expect(rows.map((r) => r.action)).toEqual(['reject', 'deny'])
    expect(rows[0]?.note).toBe('kept')
  })

  it('still refuses an action the enum does not carry', () => {
    expect(() =>
      store.db
        .prepare('INSERT INTO decisions VALUES (?, ?, ?, ?, ?)')
        .run('c1', 'analyst', 'obliterate', '2026-08-26T00:00:00Z', null),
    ).toThrow()
  })
})
