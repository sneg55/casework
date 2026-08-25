// What the second look found, in the words the drafted message uses. The message quotes the
// bytes the host served, so the screen has to show them too, or it asserts something the
// reader never saw. The sentences themselves live in lib/attribution.
import type { CaseDetail } from '../lib/api'
import {
  certificate,
  type Parsed,
  parseRows,
  redirects,
  repository,
  served,
} from '../lib/attribution'

function Link({ url, after }: { url: string | null; after?: string }) {
  if (url === null) return null
  return (
    <p className="found-url">
      <a href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
      {after === undefined ? null : ` ${after}`}
    </p>
  )
}

function Served({ rows, locator }: { rows: Parsed[]; locator: string }) {
  const facts = served(rows, locator)
  return (
    <>
      <p className="found-line">{facts.line}</p>
      {facts.prefix === null ? null : (
        <>
          <Link url={facts.url} after="began" />
          <pre className="found-bytes">{facts.prefix}</pre>
          <p className="found-note">A zip archive begins PK.</p>
        </>
      )}
    </>
  )
}

function Repo({ row }: { row: Parsed }) {
  const facts = repository(row)
  return (
    <>
      <p className="found-line">{facts.line}</p>
      {facts.missing.length === 0 ? null : (
        <ul className="found-list">
          {facts.missing.map((path) => (
            <li key={path} className="mono">
              {path}
            </li>
          ))}
        </ul>
      )}
      <Link url={row.source_url} />
    </>
  )
}

function Redirects({ rows }: { rows: Parsed[] }) {
  const facts = redirects(rows)
  return (
    <>
      <p className="found-line">{facts.line}</p>
      <ul className="found-list">
        {facts.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </>
  )
}

/** Section 9's investigation, shown as the observation it is rather than as a bare link. */
export function Attribution({ detail }: { detail: CaseDetail }) {
  const rows = parseRows(detail.attribution)
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
  const redirectRows = rows.filter((r) => r.kind === 'redirect')
  const repo = rows.find((r) => r.kind === 'repo')
  const tls = rows.find((r) => r.kind === 'tls')
  return (
    <div className="found overprint">
      {http.length > 0 ? <Served rows={http} locator={detail.locator} /> : null}
      {repo === undefined ? null : <Repo row={repo} />}
      {redirectRows.length > 0 ? <Redirects rows={redirectRows} /> : null}
      {tls === undefined ? null : <p className="found-line">{certificate(tls)}</p>}
    </div>
  )
}
