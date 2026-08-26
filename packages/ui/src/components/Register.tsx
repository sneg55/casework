// The register. One row is one cause, never a feed. The docket cell carries the real link,
// so a case can be opened in a tab, copied into a ticket and reached by keyboard; the row
// stays clickable as a convenience for the mouse.

import { useState } from 'react'

import type { QueueCase } from '../lib/api'
import { ariaSort, nextSort, type Sort, type SortKey, sortRows } from '../lib/sort'
import { words } from '../lib/words'
import { Lamp } from './Lamp'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'docket', label: 'Docket' },
  { key: 'cause_kind', label: 'Cause' },
  { key: 'locator', label: 'Where' },
  { key: 'agency_count', label: 'Ag.', numeric: true },
  { key: 'corroborating_count', label: 'Also', numeric: true },
  { key: 'party_kind', label: 'Party' },
  { key: 'confidence', label: 'Conf.', numeric: true },
  { key: 'consecutive_runs', label: 'Runs', numeric: true },
  { key: 'state', label: 'State' },
]

function Row({ row, onOpen }: { row: QueueCase; onOpen: (id: string) => void }) {
  const grouped = row.cause_kind !== 'individual'
  return (
    <tr
      className={grouped ? 'row exception' : 'row'}
      onClick={() => {
        onOpen(row.case_id)
      }}
    >
      <td className="docket">
        <a
          href={`#/cases/${row.case_id}`}
          aria-label={`Case ${row.docket}, ${words(row.cause_kind)} at ${row.locator}`}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          {row.docket}
        </a>
      </td>
      <td className="cause">{words(row.cause_kind)}</td>
      <td className="where">{row.locator}</td>
      <td className="count r">{row.agency_count}</td>
      <td className="also r overprint">
        {row.corroborating_count > 0 ? `+${row.corroborating_count}` : ''}
      </td>
      <td className="party">
        {words(row.party_kind)}
        {row.recipient_resolvable ? null : <sup className="mark">†</sup>}
      </td>
      <td className="small r">
        {row.confidence}
        <span className="of">/3</span>
      </td>
      <td className="small r">
        {row.consecutive_runs}
        <span className="of">/3</span>
      </td>
      <td className="state">
        <Lamp state={row.state} />
        <span className="state-name">{row.state}</span>
      </td>
    </tr>
  )
}

export function Register({
  rows,
  onOpen,
  caption,
}: {
  rows: QueueCase[]
  onOpen: (id: string) => void
  caption: string
}) {
  const [sort, setSort] = useState<Sort | null>(null)
  return (
    <div className="register-scroll">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.numeric === true ? 'r' : undefined}
                aria-sort={ariaSort(sort, column.key)}
              >
                <button
                  type="button"
                  className="sort"
                  onClick={() => {
                    setSort(nextSort(sort, column.key))
                  }}
                >
                  {column.label}
                  <span className="arrow" aria-hidden="true">
                    {sort?.key === column.key ? (sort.descending ? '▾' : '▴') : ''}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortRows(rows, sort).map((row) => (
            <Row key={row.case_id} row={row} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
