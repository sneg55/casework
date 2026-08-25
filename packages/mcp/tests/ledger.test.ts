// Section 11's design rule, tested against the committed run: every count on the register
// resolves to the rows behind it, and a suppressed row names the catalog field that answered it.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BUCKETS, isBucket, ledger } from '../src/features/evidence/ledger.js'
import { replayRun } from '../src/services/sandbox.js'
import { openStore, type Store } from '../src/services/store.js'

const RUN = '2026-08-24'

let store: Store
let dir: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'casework-ledger-'))
  store = openStore(join(dir, 'casework.sqlite'))
  store.persistRun(await replayRun(`data/runs/${RUN}.json`), new Date().toISOString())
})

afterAll(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('the rows behind a number', () => {
  it('answers every bucket the register can click, and nothing else', () => {
    expect(BUCKETS.every((bucket) => isBucket(bucket))).toBe(true)
    expect(isBucket('everything')).toBe(false)
  })

  it('resolves each count to exactly the rows the spec quotes', () => {
    const count = (bucket: (typeof BUCKETS)[number]) => ledger(store, RUN, bucket).rows.length
    expect(count('checked')).toBe(249)
    expect(count('healthy')).toBe(196)
    expect(count('failing')).toBe(53)
    expect(count('actionable')).toBe(28)
    expect(count('suppressed_catalog')).toBe(25)
    expect(count('suppressed_credential')).toBe(7)
    expect(count('healthy') + count('failing')).toBe(count('checked'))
    expect(count('actionable') + count('suppressed_catalog')).toBe(count('failing'))
  })

  it('names the catalog field behind every suppressed row, so the reason is checkable', () => {
    const { rows } = ledger(store, RUN, 'suppressed_catalog')
    expect(rows).not.toHaveLength(0)
    for (const row of rows) {
      expect(row.catalog_field).not.toBeNull()
      expect(row.reason).not.toBeNull()
    }
  })

  it('shows the credential feeds as declaring authentication_type, not as failures', () => {
    const { rows } = ledger(store, RUN, 'suppressed_credential')
    expect(rows).toHaveLength(7)
    for (const row of rows) expect(row.catalog_field).toBe('authentication_type')
  })

  it('narrows to one suppression reason when the apparatus asks for one', () => {
    const all = ledger(store, RUN, 'suppressed_catalog').rows
    const reason = all[0]?.reason ?? ''
    const narrowed = ledger(store, RUN, 'suppressed_catalog', reason).rows
    expect(narrowed).not.toHaveLength(0)
    expect(narrowed.length).toBeLessThanOrEqual(all.length)
    expect(narrowed.every((row) => row.reason === reason)).toBe(true)
  })

  it('never carries a contact address into a row', () => {
    for (const bucket of BUCKETS) {
      expect(JSON.stringify(ledger(store, RUN, bucket))).not.toMatch(/[\w.]+@[\w.]+/)
    }
  })
})
