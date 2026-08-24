// The boundary between the sandbox and the server: the schema here has to match what the
// Python emitter actually prints, so this test runs the real script against the committed run.
import { describe, expect, it } from 'vitest'

import { PARTY_FOR_CAUSE } from '../src/constants/enums.js'
import { replayRun } from '../src/services/sandbox.js'

describe('the case document the probe emits', () => {
  it('parses, and still describes the run the spec quotes', async () => {
    const doc = await replayRun('data/runs/2026-08-24.json')
    expect(doc.run_date).toBe('2026-08-24')
    expect(doc.counts).toMatchObject({
      checked: 249,
      healthy: 196,
      failing: 53,
      suppressed_by_credential: 7,
      suppressed_by_catalog: 25,
      actionable: 28,
    })
    expect(doc.cases.map((c) => c.agency_count)).toEqual([7, 5, 1])
    expect(doc.individual).toHaveLength(15)
  })

  it('proposes the party the enum maps to, for every case', async () => {
    const doc = await replayRun('data/runs/2026-08-24.json')
    for (const record of [...doc.cases, ...doc.individual]) {
      expect(record.proposed_party).toBe(PARTY_FOR_CAUSE[record.cause_kind])
    }
  })
})
