// The register's control line. Four state segments and one text box: a steward opens this
// queue asking "what is ready" and "what happened to that github case", and nothing else.
import type { QueueCase } from '../lib/api'
import { inStateGroup } from '../lib/words'

export interface Filter {
  group: string
  query: string
}

const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'watching', label: 'Watching' },
  { key: 'ready', label: 'Ready' },
  { key: 'decided', label: 'Decided' },
] as const

export const EMPTY_FILTER: Filter = { group: 'all', query: '' }

export function isFiltered(filter: Filter): boolean {
  return filter.group !== 'all' || filter.query.trim() !== ''
}

export function matches(row: QueueCase, filter: Filter): boolean {
  const q = filter.query.trim().toLowerCase()
  const text = `${row.docket} ${row.cause_kind} ${row.locator} ${row.party_kind}`.toLowerCase()
  return inStateGroup(row.state, filter.group) && (q === '' || text.includes(q))
}

export function Filters({
  cases,
  filter,
  onChange,
}: {
  cases: QueueCase[]
  filter: Filter
  onChange: (next: Filter) => void
}) {
  return (
    <div className="filters">
      <div className="segments" role="group" aria-label="Filter the register by state">
        {GROUPS.map((group) => (
          <button
            key={group.key}
            type="button"
            aria-pressed={filter.group === group.key}
            onClick={() => {
              onChange({ ...filter, group: group.key })
            }}
          >
            {group.label}
            <span className="n">
              {cases.filter((c) => inStateGroup(c.state, group.key)).length}
            </span>
          </button>
        ))}
      </div>
      <label className="find">
        <span>Find</span>
        <input
          type="search"
          value={filter.query}
          placeholder="docket, cause, host or party"
          onChange={(event) => {
            onChange({ ...filter, query: event.target.value })
          }}
        />
      </label>
    </div>
  )
}
