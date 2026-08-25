// What the second look found, in the words the drafted message uses. The message quotes the
// bytes the host served, so the screen has to show them too, or it asserts something the
// reader never saw.
import type { CaseDetail } from '../lib/api'

type Row = CaseDetail['attribution'][number]

interface Parsed {
  kind: string
  source_url: string | null
  observation: Record<string, unknown>
}

/** The store holds the observation as text, so a malformed row is dropped, never thrown. */
function parse(rows: Row[]): Parsed[] {
  return rows.flatMap((row): Parsed[] => {
    try {
      const observation: unknown = JSON.parse(row.observation)
      if (typeof observation !== 'object' || observation === null) return []
      return [
        {
          kind: row.kind,
          source_url: row.source_url,
          observation: observation as Record<string, unknown>,
        },
      ]
    } catch {
      return []
    }
  })
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function Served({ rows, locator }: { rows: Parsed[]; locator: string }) {
  const archives = rows.filter((r) => r.observation['magic_ok'] === true).length
  const types = [...new Set(rows.map((r) => str(r.observation['content_type']) ?? 'no type'))]
  const quoted = rows.find((r) => str(r.observation['body_prefix']) !== null)
  const prefix = quoted === undefined ? null : str(quoted.observation['body_prefix'])
  return (
    <>
      <p className="found-line">
        Re-fetched {rows.length} of {locator}. {archives === 0 ? 'None' : String(archives)} served
        an archive; the rest answered {types.join(', ')}.
      </p>
      {prefix === null || quoted === undefined ? null : (
        <>
          {quoted.source_url === null ? null : (
            <p className="found-url">
              <a href={quoted.source_url} target="_blank" rel="noreferrer">
                {quoted.source_url}
              </a>{' '}
              began
            </p>
          )}
          <pre className="found-bytes">{prefix}</pre>
          <p className="found-note">A zip archive begins PK.</p>
        </>
      )}
    </>
  )
}

function Repo({ row }: { row: Parsed }) {
  const o = row.observation
  const missing = list(o['paths_missing']).length
  const referenced = missing + list(o['paths_present']).length
  const state =
    o['exists'] === false
      ? 'is gone or private'
      : o['archived'] === true
        ? 'is archived'
        : 'is alive'
  const pushed = str(o['pushed_at'])
  return (
    <>
      <p className="found-line">
        {str(o['owner']) ?? 'the owner'}/{str(o['repo']) ?? 'the repository'} {state}
        {pushed === null ? '' : `, pushed ${pushed}`}. {missing} of the {referenced} directories the
        catalog references are gone.
      </p>
      {row.source_url === null ? null : (
        <p className="found-url">
          <a href={row.source_url} target="_blank" rel="noreferrer">
            {row.source_url}
          </a>
        </p>
      )}
    </>
  )
}

function Redirects({ rows }: { rows: Parsed[] }) {
  const serving = rows.filter((r) => r.observation['replacement_healthy'] === true).length
  return (
    <>
      <p className="found-line">
        {serving} of {rows.length} sampled siblings already point at a replacement that serves.
      </p>
      <ul className="found-list">
        {rows.map((row, index) => (
          <li key={`${str(row.observation['from_feed_id']) ?? 'row'}-${String(index)}`}>
            <span className="mono">{str(row.observation['from_feed_id']) ?? 'feed'}</span>{' '}
            {str(row.observation['note']) ?? 'no note recorded'}
          </li>
        ))}
      </ul>
    </>
  )
}

function Certificate({ row }: { row: Parsed }) {
  const o = row.observation
  if (o['reachable'] !== true) {
    return (
      <p className="found-line">{row.source_url ?? 'the host'} did not complete a handshake.</p>
    )
  }
  return (
    <p className="found-line">
      Certificate for {str(o['subject']) ?? 'the host'}, issued by{' '}
      {str(o['issuer']) ?? 'an unknown issuer'}, expires{' '}
      {str(o['valid_to']) ?? 'at an unknown date'}.
    </p>
  )
}

/** Section 9's investigation, shown as the observation it is rather than as a bare link. */
export function Attribution({ detail }: { detail: CaseDetail }) {
  const rows = parse(detail.attribution)
  if (rows.length === 0) {
    return (
      <div className="found">
        <p className="found-line">
          Not investigated yet, so this case has no counted evidence. Ask the agent to attribute it.
        </p>
      </div>
    )
  }

  const http = rows.filter((r) => r.kind === 'http')
  const redirects = rows.filter((r) => r.kind === 'redirect')
  const repo = rows.find((r) => r.kind === 'repo')
  const tls = rows.find((r) => r.kind === 'tls')
  return (
    <div className="found overprint">
      {http.length > 0 ? <Served rows={http} locator={detail.locator} /> : null}
      {repo === undefined ? null : <Repo row={repo} />}
      {redirects.length > 0 ? <Redirects rows={redirects} /> : null}
      {tls === undefined ? null : <Certificate row={tls} />}
    </div>
  )
}
