// Evidence is a discriminated record, per docs/SPEC.md section 6. What one response looked
// like is `http`; what the catalog declares about the same entry is `catalog`. The repo,
// redirect and tls kinds are written by the attribution step, not from a run file.
import type { Detection } from '../../schemas/caseDocument.js'

export type Evidence =
  | {
      kind: 'http'
      observation: {
        feed_id: string | null
        url: string
        status_class: string
        http_code: number | null
        content_type: string
        magic_ok: boolean
        tls_ok: boolean | null
        latency_ms: number
      }
      source_url: string
      observed_at: string
    }
  | {
      kind: 'catalog'
      observation: { feed_id: string | null; field: string; value: string }
      source_url: null
      observed_at: string
    }

function catalogFacts(d: Detection): Evidence[] {
  const fields: [string, string][] = []
  if (d.catalog_status !== '') fields.push(['status', d.catalog_status])
  if (d.redirect_id !== '') fields.push(['redirect.id', d.redirect_id])
  if (d.auth_type !== '' && d.auth_type !== '0') fields.push(['authentication_type', d.auth_type])
  return fields.map(([field, value]) => ({
    kind: 'catalog' as const,
    observation: { feed_id: d.feed_id, field, value },
    source_url: null,
    observed_at: d.observed_at,
  }))
}

/** Every observation backing a case, with timestamps. Never a contact address. */
export function evidenceFor(detections: readonly Detection[]): Evidence[] {
  return detections.flatMap((d) => [
    {
      kind: 'http' as const,
      observation: {
        feed_id: d.feed_id,
        url: d.url,
        status_class: d.status_class,
        http_code: d.http_code,
        content_type: d.content_type,
        magic_ok: d.magic_ok,
        tls_ok: d.tls_ok,
        latency_ms: d.latency_ms,
      },
      source_url: d.url,
      observed_at: d.observed_at,
    },
    ...catalogFacts(d),
  ])
}
