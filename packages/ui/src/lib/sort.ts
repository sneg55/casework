// Sorting the register. The default order is the one the queue arrives in, which is rank by
// actionable agency count, so "no column chosen" is a real state and clicking back to it is
// how you get the ranking back.
import type { QueueCase } from './api'

export type SortKey =
  | 'docket'
  | 'cause_kind'
  | 'locator'
  | 'agency_count'
  | 'corroborating_count'
  | 'party_kind'
  | 'confidence'
  | 'consecutive_runs'
  | 'state'

export interface Sort {
  key: SortKey
  descending: boolean
}

/** Click a column: first press sorts, second reverses, third returns to the queue's order. */
export function nextSort(current: Sort | null, key: SortKey): Sort | null {
  if (current === null || current.key !== key) return { key, descending: false }
  if (!current.descending) return { key, descending: true }
  return null
}

const NUMERIC = new Set<SortKey>([
  'agency_count',
  'corroborating_count',
  'confidence',
  'consecutive_runs',
])

export function sortRows(rows: QueueCase[], sort: Sort | null): QueueCase[] {
  if (sort === null) return rows
  const direction = sort.descending ? -1 : 1
  // Copied, because the caller's array is the filtered queue and sorting in place would
  // reorder what the next render filters.
  return [...rows].sort((a, b) => {
    const left = a[sort.key]
    const right = b[sort.key]
    if (NUMERIC.has(sort.key)) return (Number(left) - Number(right)) * direction
    return String(left).localeCompare(String(right)) * direction
  })
}

/** What a screen reader should say the column is doing right now. */
export function ariaSort(sort: Sort | null, key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sort === null || sort.key !== key) return 'none'
  return sort.descending ? 'descending' : 'ascending'
}
