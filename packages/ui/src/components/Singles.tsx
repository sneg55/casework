// Single-feed failures, kept as apparatus rather than as register. Fifteen rows carrying one
// agency, no siblings and no attribution repeated the same five values at full weight and
// drowned the three grouped causes the page had just claimed were the point.

import type { QueueCase } from '../lib/api'
import { Lamp } from './Lamp'

export function Singles({ rows, open }: { rows: QueueCase[]; open: boolean }) {
  if (rows.length === 0) return null
  return (
    <details className="singles" open={open}>
      <summary>
        <b>{rows.length}</b> single-feed failures, one agency each, no sibling entries
      </summary>
      <ul>
        {rows.map((row) => (
          <li key={row.case_id}>
            <a href={`#/cases/${row.case_id}`}>
              <span className="docket">{row.docket}</span>
              <span className="where">{row.locator}</span>
              <span className="party">
                {row.party_kind}
                {row.recipient_resolvable ? null : <sup className="mark">†</sup>}
              </span>
              <span className="state">
                <Lamp state={row.state} />
                {row.consecutive_runs}
                <span className="of">/3</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}
