// Bringing an existing store up to the current schema.
//
// `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists, so widening a CHECK
// constraint in schema.sql.ts silently leaves every store built before the change rejecting the
// new value. That is not a fresh-install problem, it is the only kind of store a judge has.
import type { Database } from 'better-sqlite3'

import { DECISION_ACTIONS } from '../constants/enums.js'

function definitionOf(db: Database, table: string): string {
  const row = db
    .prepare<[string], { sql: string | null }>('SELECT sql FROM sqlite_master WHERE name = ?')
    .get(table)
  return row?.sql ?? ''
}

/** Rebuild `decisions` when its CHECK predates a value the enum now carries. */
function widenDecisionActions(db: Database): boolean {
  const current = definitionOf(db, 'decisions')
  if (current === '') return false
  const missing = DECISION_ACTIONS.filter((action) => !current.includes(`'${action}'`))
  if (missing.length === 0) return false

  const allowed = DECISION_ACTIONS.map((a) => `'${a}'`).join(',')
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE decisions_migrated (
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      actor   TEXT NOT NULL,
      action  TEXT NOT NULL CHECK (action IN (${allowed})),
      at      TEXT NOT NULL,
      note    TEXT
    );
    INSERT INTO decisions_migrated SELECT case_id, actor, action, at, note FROM decisions;
    DROP TABLE decisions;
    ALTER TABLE decisions_migrated RENAME TO decisions;
    PRAGMA foreign_keys = ON;
  `)
  return true
}

/** Runs on every open. Each step is a no-op once its change is already in the file. */
export function migrate(db: Database): string[] {
  const applied: string[] = []
  if (widenDecisionActions(db))
    applied.push('decisions.action accepts every DECISION_ACTIONS value')
  return applied
}
