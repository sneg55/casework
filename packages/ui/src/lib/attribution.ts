// The sentences the case page says about what the second look found. They are here rather
// than in the component because every one of them is a claim about an observation, and a
// claim is worth a test.
import type { CaseDetail } from './api'

type Row = CaseDetail['attribution'][number]

export interface Parsed {
  kind: string
  source_url: string | null
  observation: Record<string, unknown>
}

/** The store holds the observation as text, so a malformed row is dropped, never thrown. */
export function parseRows(rows: Row[]): Parsed[] {
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
const names = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

export interface Served {
  line: string
  url: string | null
  prefix: string | null
}

/**
 * What the platform answered on the second fetch, and the bytes it opened with. The types and
 * the quoted body are read off the responses that did not serve an archive, because those are
 * the ones the sentence is about: an archive's own first bytes are PK, which is the answer the
 * case says is missing.
 */
export function served(rows: Parsed[], locator: string): Served {
  const archived = rows.filter((r) => r.observation['magic_ok'] === true)
  const rest = rows.filter((r) => r.observation['magic_ok'] !== true)
  const types = [...new Set(rest.map((r) => str(r.observation['content_type']) ?? 'no type'))]
  const quoted = rest.find((r) => str(r.observation['body_prefix']) !== null)
  const opening = `Re-fetched ${String(rows.length)} of ${locator}.`
  let line: string
  if (rest.length === 0) {
    line = `${opening} Every one served an archive.`
  } else if (archived.length === 0) {
    line = `${opening} None served an archive; they answered ${types.join(', ')}.`
  } else {
    line =
      `${opening} ${String(archived.length)} served an archive; ` +
      `the other ${String(rest.length)} answered ${types.join(', ')}.`
  }
  return {
    line,
    url: quoted?.source_url ?? null,
    prefix: quoted === undefined ? null : str(quoted.observation['body_prefix']),
  }
}

/**
 * The transport investigations re-probe the same way the content one does, so their rows carry
 * the same `http` kind. What they establish is different: whether the host failed a second time
 * or whether the first run caught a flap. Saying "none served an archive" about an unreachable
 * host answers a question nobody asked.
 */
export function transport(rows: Parsed[], locator: string): string {
  const classes = rows.map((r) => str(r.observation['status_class']) ?? 'no status')
  const recovered = classes.filter((c) => c === 'ok').length
  if (recovered === rows.length) {
    return `${locator} answered on the second fetch, so the first run may have caught a flap.`
  }
  const seen = [...new Set(classes.filter((c) => c !== 'ok'))]
  const partly =
    recovered === 0
      ? `${locator} failed again on a second fetch`
      : `${locator} failed again on ${String(rows.length - recovered)} of ${String(rows.length)} re-fetched`
  return `${partly}: ${seen.join(', ')}.`
}

/** Section 9 sends these cause kinds through the transport investigation, not the content one. */
const TRANSPORT_CAUSES = new Set(['redirect_unresolved', 'host_unreachable', 'auth_rejected'])

export function isTransportCause(causeKind: string): boolean {
  return TRANSPORT_CAUSES.has(causeKind)
}

/**
 * The repository, with no denominator. `paths_present` is every top-level directory in the
 * repository, dotfiles included, not the catalog-referenced ones that survived, so adding it
 * to `paths_missing` would state a count of referenced directories that is not true.
 */
export function repository(row: Parsed): { line: string; missing: string[] } {
  const o = row.observation
  const missing = names(o['paths_missing'])
  const state =
    o['exists'] === false
      ? 'is gone or private'
      : o['archived'] === true
        ? 'is archived'
        : 'is alive'
  const pushed = str(o['pushed_at'])
  const owner = str(o['owner']) ?? 'the owner'
  const repo = str(o['repo']) ?? 'the repository'
  const gone =
    missing.length === 1
      ? 'One directory the catalog references is gone.'
      : `${String(missing.length)} directories the catalog references are gone.`
  return {
    line: `${owner}/${repo} ${state}${pushed === null ? '' : `, pushed ${pushed}`}. ${gone}`,
    missing,
  }
}

export function redirects(rows: Parsed[]): { line: string; notes: string[] } {
  const serving = rows.filter((r) => r.observation['replacement_healthy'] === true).length
  return {
    line: `${String(serving)} of ${String(rows.length)} sampled siblings already point at a replacement that serves.`,
    notes: rows.map(
      (r) =>
        `${str(r.observation['from_feed_id']) ?? 'feed'} ${str(r.observation['note']) ?? 'no note recorded'}`,
    ),
  }
}

export function certificate(row: Parsed): string {
  const o = row.observation
  if (o['reachable'] !== true) {
    return `${row.source_url ?? 'the host'} did not complete a handshake.`
  }
  return (
    `Certificate for ${str(o['subject']) ?? 'the host'}, ` +
    `issued by ${str(o['issuer']) ?? 'an unknown issuer'}, ` +
    `expires ${str(o['valid_to']) ?? 'at an unknown date'}.`
  )
}
