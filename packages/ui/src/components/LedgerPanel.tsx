// What is behind a number. Opened by clicking any count on the register, so the totals strip
// and the apparatus are both checkable rather than asserted.
import { useEffect, useState } from 'react'

import { api, type Bucket, type Ledger } from '../lib/api'

export interface LedgerRequest {
  bucket: Bucket
  reason?: string
}

function Rows({ data }: { data: Ledger }) {
  const catalogued = data.rows.some((row) => row.catalog_field !== null)
  return (
    <div className="ledger-scroll">
      <table className="ledger-table">
        <thead>
          <tr>
            <th scope="col">Feed</th>
            <th scope="col">Provider</th>
            <th scope="col">Seen</th>
            {catalogued ? <th scope="col">Catalog says</th> : null}
            <th scope="col">URL</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={`${row.feed_id ?? row.url}`}>
              <td className="mono">{row.feed_id ?? 'unlisted'}</td>
              <td>{row.provider}</td>
              <td className="mono">
                {row.status_class}
                {row.http_code === null ? '' : ` · ${String(row.http_code)}`}
                {row.content_type === '' ? '' : ` · ${row.content_type}`}
              </td>
              {catalogued ? (
                <td className="mono catalog-cell">
                  {row.catalog_field === null ? '' : `${row.catalog_field} = ${row.catalog_value}`}
                </td>
              ) : null}
              <td className="url-cell">
                <a href={row.url} target="_blank" rel="noreferrer">
                  {row.url}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LedgerPanel({ request, onClose }: { request: LedgerRequest; onClose: () => void }) {
  const [data, setData] = useState<Ledger | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    api
      .ledger(request.bucket, request.reason)
      .then(setData)
      .catch((e: unknown) => {
        setError(String(e))
      })
  }, [request])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <section className="ledger" aria-label="The rows behind this number">
      <div className="ledger-head">
        <h3>{data?.title ?? 'Reading the rows…'}</h3>
        <span className="ledger-count">
          {data === null ? '' : `${String(data.rows.length)} rows`}
        </span>
        <button type="button" className="ledger-close" onClick={onClose}>
          Close
        </button>
      </div>
      {error !== null ? (
        <p className="status quiet">These rows did not load. {error}</p>
      ) : data === null ? (
        <p className="status quiet">Reading the rows…</p>
      ) : (
        <Rows data={data} />
      )}
    </section>
  )
}
