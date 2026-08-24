// The queue. One row is one cause, never a feed, and every number is clickable through to
// the observation that produced it.
import { useEffect, useState } from 'react'

import { api, type Queue as QueueData } from '../lib/api'

function Count({ n, label, lead }: { n: number; label: string; lead?: boolean }) {
  return (
    <div className={lead === true ? 'count lead' : 'count'}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
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

  if (error !== null) return <p className="note">The read API is not answering: {error}</p>
  if (data === null) return <p className="note">Reading the queue…</p>
  if (data.run === null) return <p className="note">No captured run yet. Run the probe first.</p>

  const run = data.run
  return (
    <>
      <div className="counts">
        <Count n={run.checked} label="checked" />
        <Count n={run.healthy} label="healthy" />
        <Count n={run.failing} label="failing" />
        <Count n={run.suppressed_credential + run.suppressed_catalog} label="answered already" />
        <Count n={run.actionable} label="actionable" />
        <Count n={data.cases.length} label="cases" lead />
      </div>

      <p className="note">
        A per-feed view opens {run.failing} tickets on this run. The queue below has{' '}
        {data.cases.length} rows, and {run.suppressed_credential + run.suppressed_catalog} of the
        failures are things the catalog already answers.
      </p>

      <div className="section-title">Cases</div>
      <table>
        <thead>
          <tr>
            <th>Cause</th>
            <th>Where</th>
            <th>Agencies</th>
            <th>Also</th>
            <th>Party</th>
            <th>Confidence</th>
            <th>Runs</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {data.cases.map((c) => (
            <tr
              key={c.case_id}
              onClick={() => {
                onOpen(c.case_id)
              }}
            >
              <td>{c.cause_kind.replaceAll('_', ' ')}</td>
              <td className="mono">{c.locator}</td>
              <td className="n">{c.agency_count}</td>
              <td className="n">{c.corroborating_count > 0 ? `+${c.corroborating_count}` : ''}</td>
              <td>
                {c.party_kind}
                {c.recipient_resolvable ? '' : ' (no channel)'}
              </td>
              <td className="n">{c.confidence}/3</td>
              <td className="n">{c.consecutive_runs}/3</td>
              <td>
                <span className={`pill ${c.state}`}>{c.state}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-title">Deliberately not raised</div>
      <ul className="suppressed">
        {data.suppressed.map((s) => (
          <li key={s.reason}>
            <strong>{s.n}</strong> {s.reason}
          </li>
        ))}
        <li>
          <strong>{run.healthy}</strong> feeds are serving a zip archive and produce nothing at all
        </li>
      </ul>
      <p className="note">
        Run {run.run_date}. Runs on file: {data.runs_on_file.join(', ')}. The three-run rule counts
        files, so a day with no run does not advance a counter.
      </p>
    </>
  )
}
