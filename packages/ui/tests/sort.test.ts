// Sorting the register, including the third click that gives the queue's own ranking back.
import { describe, expect, it } from 'vitest'

import type { QueueCase } from '../src/lib/api'
import { ariaSort, nextSort, sortRows } from '../src/lib/sort'

function row(docket: string, agency_count: number, state: string): QueueCase {
  return {
    case_id: docket.toLowerCase(),
    docket,
    cause_kind: 'individual',
    locator: `${docket}.example`,
    agency_count,
    corroborating_count: 0,
    party_kind: 'agency',
    recipient_resolvable: true,
    confidence: 3,
    consecutive_runs: 3,
    runs_needed: 0,
    state,
  }
}

const ROWS = [row('CW-0003', 7, 'ready'), row('CW-0001', 1, 'approved'), row('CW-0002', 5, 'ready')]

describe('nextSort', () => {
  it('cycles ascending, descending, then back to the queue order', () => {
    const first = nextSort(null, 'agency_count')
    expect(first).toEqual({ key: 'agency_count', descending: false })
    const second = nextSort(first, 'agency_count')
    expect(second).toEqual({ key: 'agency_count', descending: true })
    expect(nextSort(second, 'agency_count')).toBeNull()
  })

  it('starts a different column ascending rather than inheriting the last direction', () => {
    expect(nextSort({ key: 'docket', descending: true }, 'state')).toEqual({
      key: 'state',
      descending: false,
    })
  })
})

describe('sortRows', () => {
  it('leaves the queue order alone when no column is chosen', () => {
    expect(sortRows(ROWS, null).map((r) => r.docket)).toEqual(['CW-0003', 'CW-0001', 'CW-0002'])
  })

  it('sorts a numeric column by value, not by its string form', () => {
    const rows = [row('A', 10, 'ready'), row('B', 9, 'ready'), row('C', 100, 'ready')]
    const sorted = sortRows(rows, { key: 'agency_count', descending: false })
    expect(sorted.map((r) => r.agency_count)).toEqual([9, 10, 100])
  })

  it('sorts a text column and reverses it', () => {
    expect(sortRows(ROWS, { key: 'docket', descending: false }).map((r) => r.docket)).toEqual([
      'CW-0001',
      'CW-0002',
      'CW-0003',
    ])
    expect(sortRows(ROWS, { key: 'docket', descending: true }).map((r) => r.docket)).toEqual([
      'CW-0003',
      'CW-0002',
      'CW-0001',
    ])
  })

  it('does not reorder the array it was given', () => {
    const original = [...ROWS]
    sortRows(ROWS, { key: 'docket', descending: false })
    expect(ROWS).toEqual(original)
  })
})

describe('ariaSort', () => {
  it('reports none for every column but the sorted one', () => {
    const sort = { key: 'state' as const, descending: true }
    expect(ariaSort(sort, 'state')).toBe('descending')
    expect(ariaSort(sort, 'docket')).toBe('none')
    expect(ariaSort(null, 'state')).toBe('none')
  })
})
