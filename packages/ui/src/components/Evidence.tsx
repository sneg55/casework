// The schedule body: every observation behind the case, at the size a timetable sets its
// figures. Nothing here is a summary the reader has to trust.
import type { Evidence as EvidenceRow } from '../lib/api'

function value(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return JSON.stringify(v)
}

const SUPPRESSING = new Set(['deprecated', 'inactive', 'development'])

/** An exception is a catalog fact that changes what happens: a retirement, a replacement,
 * a declared credential. `status = active` is not an exception and is not marked as one. */
function isException(row: EvidenceRow): boolean {
  if (row.kind !== 'catalog') return false
  const field = value(row.observation['field'])
  return field !== 'status' || SUPPRESSING.has(value(row.observation['value']))
}

function seen(row: EvidenceRow): string {
  if (row.kind === 'catalog') {
    return `${value(row.observation['field'])} = ${value(row.observation['value'])}`
  }
  const type = value(row.observation['content_type'])
  return [
    value(row.observation['status_class']),
    value(row.observation['http_code']),
    type === '—' || type === '' ? 'no content type' : type,
    `${value(row.observation['latency_ms'])} ms`,
  ].join('  ·  ')
}

export function Evidence({ rows }: { rows: EvidenceRow[] }) {
  if (rows.length === 0) return <p className="status">No observations recorded for this run.</p>
  return (
    <table className="evidence">
      <thead>
        <tr>
          <th>Kind</th>
          <th>Feed</th>
          <th>What was seen</th>
          <th>Observed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={`${row.kind}-${value(row.observation['feed_id'])}-${String(index)}`}
            className={isException(row) ? `${row.kind} exception` : row.kind}
          >
            <td className="kind">{row.kind}</td>
            <td className="feed">{value(row.observation['feed_id'])}</td>
            <td className="seen">{seen(row)}</td>
            <td className="at">{row.observed_at}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
