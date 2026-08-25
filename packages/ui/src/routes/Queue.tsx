// The register page. The grouped causes are the register; the single-feed failures are
// apparatus, and so are the suppressions. The thesis sentence quotes the same figures the
// strip does, in the order they subtract.
import { useEffect, useState } from 'react'

import { EMPTY_FILTER, type Filter, Filters, isFiltered, matches } from '../components/Filters'
import { LedgerPanel, type LedgerRequest } from '../components/LedgerPanel'
import { Register } from '../components/Register'
import { Singles } from '../components/Singles'
import { Totals } from '../components/Totals'
import { api, type Bucket, type QueueCase, type Queue as QueueData } from '../lib/api'

// The one reason that says the feed is healthy rather than suppressed. It comes from
// scripts/cases.py, which is where the wording is defined.
const CREDENTIAL_REASON = 'catalog declares a credential is required'

export function Queue({ onOpen }: { onOpen: (caseId: string) => void }) {
  const [data, setData] = useState<QueueData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER)
  const [ledger, setLedger] = useState<LedgerRequest | null>(null)
  const openBucket = (bucket: Bucket) => {
    setLedger({ bucket })
  }
  const closeLedger = () => {
    setLedger(null)
  }

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
  const isGrouped = (row: QueueCase) => row.cause_kind !== 'individual'
  const feeds = (rows: QueueCase[]) => rows.reduce((sum, row) => sum + row.agency_count, 0)
  const allGrouped = data.cases.filter(isGrouped)
  const shown = data.cases.filter((row) => matches(row, filter))
  const grouped = shown.filter(isGrouped)
  const singles = shown.filter((row) => !isGrouped(row))

  return (
    <>
      <div className="thesis">
        <div className="figure">
          {run.failing}
          <span className="to overprint">→</span>
          {data.cases.length}
        </div>
        <p>
          A per-feed view opens {run.failing} tickets on this run. The catalog already answers{' '}
          {run.suppressed_catalog} of them. The {run.actionable} left share {data.cases.length} root
          causes, and {allGrouped.length} of those causes account for {feeds(allGrouped)} feeds
          between them.
        </p>
      </div>

      <Totals run={run} onOpen={openBucket} />

      {ledger === null ? null : <LedgerPanel request={ledger} onClose={closeLedger} />}

      <h2 className="sec">The register</h2>
      <Filters cases={data.cases} filter={filter} onChange={setFilter} />

      {shown.length === 0 ? (
        <p className="status quiet">
          Nothing in the register matches this filter.{' '}
          <button
            type="button"
            className="retry"
            onClick={() => {
              setFilter(EMPTY_FILTER)
            }}
          >
            Show all {data.cases.length}
          </button>
        </p>
      ) : grouped.length === 0 ? (
        <p className="status quiet">
          No grouped cause matches. {singles.length} single-feed{' '}
          {singles.length === 1 ? 'failure does' : 'failures do'}, below.
        </p>
      ) : (
        <Register
          rows={grouped}
          onOpen={onOpen}
          caption={`${String(grouped.length)} grouped causes covering ${String(feeds(grouped))} feeds`}
        />
      )}

      <Singles rows={singles} open={isFiltered(filter)} />

      <div className="apparatus">
        <h2>
          Not raised,
          <br />
          and why
        </h2>
        <ul>
          {data.suppressed.map((entry) => (
            <li key={entry.reason}>
              <button
                type="button"
                className="inline-n"
                onClick={() => {
                  setLedger({
                    bucket:
                      entry.reason === CREDENTIAL_REASON
                        ? 'suppressed_credential'
                        : 'suppressed_catalog',
                    reason: entry.reason,
                  })
                }}
              >
                <b>{entry.n}</b>
                {entry.reason}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="inline-n"
              onClick={() => {
                openBucket('healthy')
              }}
            >
              <b>{run.healthy}</b>feeds are serving a zip archive and produce nothing at all
            </button>
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
