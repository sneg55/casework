// Section 11's design rule: every number on screen resolves to the observations that produced
// it. A count with no way through to its rows is a summary the reader has to trust, and this
// product's whole argument is that it should not have to.
import { readRun } from '../../services/runFiles.js'
import type { Store } from '../../services/store.js'

export const BUCKETS = [
  'checked',
  'healthy',
  'failing',
  'actionable',
  'suppressed_catalog',
  'suppressed_credential',
] as const

export type Bucket = (typeof BUCKETS)[number]

export function isBucket(value: string): value is Bucket {
  return (BUCKETS as readonly string[]).includes(value)
}

export interface LedgerRow {
  feed_id: string | null
  provider: string
  url: string
  status_class: string
  http_code: number | null
  content_type: string
  /** The catalog field and value that answered this row, when one did. */
  catalog_field: string | null
  catalog_value: string | null
  reason: string | null
  observed_at: string
}

const TITLES = new Map<Bucket, string>([
  ['checked', 'Feeds checked on this run, after the declared-credential entries were set aside'],
  ['healthy', 'Feeds serving a zip archive'],
  ['failing', 'Feeds that did not serve a zip archive'],
  ['actionable', 'Failures the catalog has not already answered'],
  ['suppressed_catalog', 'Failures the catalog has already retired, re-pointed or not yet shipped'],
  [
    'suppressed_credential',
    'Feeds that answered 401 or 403 and are healthy, because a key is declared',
  ],
])

/** The catalog field that justifies setting a row aside, so the reason is checkable. */
function catalogField(row: {
  auth_type: string
  catalog_status: string
  redirect_id: string
}): { field: string; value: string } | null {
  if (row.auth_type !== '' && row.auth_type !== '0') {
    return { field: 'authentication_type', value: row.auth_type }
  }
  if (row.redirect_id !== '') return { field: 'redirect.id', value: row.redirect_id }
  if (row.catalog_status !== '') return { field: 'status', value: row.catalog_status }
  return null
}

export function ledger(
  store: Store,
  runDate: string,
  bucket: Bucket,
  reason?: string,
): { bucket: Bucket; title: string; rows: LedgerRow[] } {
  const detections = readRun(runDate)
  const suppressed = new Map(
    store.db
      .prepare<[string], { feed_id: string; reason: string }>(
        'SELECT feed_id, reason FROM suppressions WHERE run_date = ?',
      )
      .all(runDate)
      .map((row) => [row.feed_id, row.reason]),
  )

  const credential = (d: (typeof detections)[number]) => d.status_class === 'auth_declared'
  const inScope = detections.filter((d) => !credential(d))
  const reasonOf = (d: (typeof detections)[number]) =>
    d.feed_id === null ? null : (suppressed.get(d.feed_id) ?? null)

  const picked =
    bucket === 'checked'
      ? inScope
      : bucket === 'healthy'
        ? inScope.filter((d) => d.healthy)
        : bucket === 'failing'
          ? inScope.filter((d) => !d.healthy)
          : bucket === 'actionable'
            ? inScope.filter((d) => !d.healthy && reasonOf(d) === null)
            : bucket === 'suppressed_catalog'
              ? inScope.filter((d) => !d.healthy && reasonOf(d) !== null)
              : detections.filter(credential)

  const rows = picked
    .filter((d) => reason === undefined || reasonOf(d) === reason)
    .map((d): LedgerRow => {
      const field = catalogField(d)
      return {
        feed_id: d.feed_id,
        provider: d.provider,
        url: d.url,
        status_class: d.status_class,
        http_code: d.http_code,
        content_type: d.content_type,
        catalog_field: field?.field ?? null,
        catalog_value: field?.value ?? null,
        reason: reasonOf(d) ?? (bucket === 'suppressed_credential' ? 'declared credential' : null),
        observed_at: d.observed_at,
      }
    })

  return { bucket, title: reason ?? TITLES.get(bucket) ?? bucket, rows }
}
