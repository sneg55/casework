// The register. One row is one cause, never a feed. The suppressed feeds are the footnote
// apparatus at the foot of the page, because that is what they are: entries the catalog has
// already annotated.
import { useEffect, useState } from 'react'

import { Lamp } from '../components/Lamp'
import { api, type QueueCase, type Queue as QueueData } from '../lib/api'
import { docketNumber } from '../lib/docket'

function Total({ n, label, lead }: { n: number; label: string; lead?: boolean }) {
  return (
    <div className={lead === true ? 'hi' : undefined}>
      <span className="n">{n}</span>
      <span className="l">{label}</span>
    </div>
  )
}

function Row({
  index,
  row,
  onOpen,
}: {
  index: number
  row: QueueCase
  onOpen: (id: string) => void
}) {
  const grouped = row.cause_kind !== 'individual'
  return (
    <tr
      className={grouped ? 'row exception' : 'row'}
      tabIndex={0}
      onClick={() => {
        onOpen(row.case_id)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(row.case_id)
        }
      }}
    >
      <td className="docket">{docketNumber(index)}</td>
      <td className="cause">{row.cause_kind.replaceAll('_', ' ')}</td>
      <td className="where">{row.locator}</td>
      <td className="count r">{row.agency_count}</td>
      <td className="also r overprint">
        {row.corroborating_count > 0 ? `+${row.corroborating_count}` : ''}
      </td>
      <td className="party">
        {row.party_kind}
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

export function Queue({ onOpen }: { onOpen: (caseId: string) => void }) {
  const [data, setData] = useState<QueueData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .queue()
      .then(setData)
      .catch((e: unknown) => {
        setError(String(e))
      })
  }, [])

  if (error !== null) {
    return (
      <p className="status">
        The read API is not answering. Start it with <code>npm run api -w @casework/mcp</code>.
        <br />
        {error}
      </p>
    )
  }
  if (data === null) return <p className="status">Reading the register…</p>
  if (data.run === null) {
    return (
      <p className="status">
        No run has been captured yet. Run <code>python3 scripts/probe_catalog.py</code>, then{' '}
        <code>npm run build:cases -w @casework/mcp</code>.
      </p>
    )
  }

  const run = data.run
  const answered = run.suppressed_credential + run.suppressed_catalog

  return (
    <>
      <div className="thesis">
        <div className="figure">
          {run.failing}
          <span className="to overprint">→</span>
          {data.cases.length}
        </div>
        <p>
          A per-feed view opens {run.failing} tickets on this run. Grouped by cause, and with the{' '}
          {answered} failures the catalog already answers taken out, the register is{' '}
          {data.cases.length} things a person could work.
        </p>
      </div>

      <div className="strip">
        <Total n={run.checked} label="checked" />
        <Total n={run.healthy} label="healthy" />
        <Total n={run.failing} label="failing" />
        <Total n={answered} label="already answered" />
        <Total n={run.actionable} label="actionable" lead />
      </div>

      <h2 className="sec">The register</h2>
      <div className="register-scroll">
        <table>
          <thead>
            <tr>
              <th>Docket</th>
              <th>Cause</th>
              <th>Where</th>
              <th className="r">Ag.</th>
              <th className="r">Also</th>
              <th>Party</th>
              <th className="r">Conf.</th>
              <th className="r">Runs</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {data.cases.map((row, index) => (
              <Row key={row.case_id} index={index} row={row} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="apparatus">
        <h2>
          Not raised,
          <br />
          and why
        </h2>
        <ul>
          {data.suppressed.map((entry) => (
            <li key={entry.reason}>
              <b>{entry.n}</b>
              {entry.reason}
            </li>
          ))}
          <li>
            <b>{run.healthy}</b>feeds are serving a zip archive and produce nothing at all
          </li>
          <li className="mark-note">
            <b>†</b>no channel on file for that party, so the case cannot be approved
          </li>
        </ul>
      </div>
      <p className="colophon">
        Run {run.run_date}. Runs on file: {data.runs_on_file.join(', ')}. The three-run rule counts
        run files, not calendar days, so a day with no run does not advance a counter.
      </p>
    </>
  )
}
