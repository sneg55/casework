// Nothing on screen is a summary the user has to trust: this is the row-level detail behind
// the counts, with the timestamp each one was observed at.
import type { Evidence as EvidenceRow } from '../lib/api'

function value(v: unknown): string {
  if (v === null || v === undefined) return '-'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return JSON.stringify(v)
}

export function Evidence({ rows }: { rows: EvidenceRow[] }) {
  const http = rows.filter((r) => r.kind === 'http')
  const catalog = rows.filter((r) => r.kind === 'catalog')
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
        {http.map((r) => (
          <tr key={`h${value(r.observation['feed_id'])}`}>
            <td>http</td>
            <td>{value(r.observation['feed_id'])}</td>
            <td>
              {value(r.observation['status_class'])} · {value(r.observation['http_code'])} ·{' '}
              {value(r.observation['content_type']) || 'no content type'} ·{' '}
              {value(r.observation['latency_ms'])} ms
            </td>
            <td>{r.observed_at}</td>
          </tr>
        ))}
        {catalog.map((r) => (
          <tr key={`c${value(r.observation['feed_id'])}${value(r.observation['field'])}`}>
            <td>catalog</td>
            <td>{value(r.observation['feed_id'])}</td>
            <td>
              {value(r.observation['field'])} = {value(r.observation['value'])}
            </td>
            <td>{r.observed_at}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
