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

/** What the platform answered on the second fetch, and the bytes it opened with. */
export function served(rows: Parsed[], locator: string): Served {
  const archives = rows.filter((r) => r.observation['magic_ok'] === true).length
  const types = [...new Set(rows.map((r) => str(r.observation['content_type']) ?? 'no type'))]
  const quoted = rows.find((r) => str(r.observation['body_prefix']) !== null)
  return {
    line:
      `Re-fetched ${String(rows.length)} of ${locator}. ` +
      `${archives === 0 ? 'None' : String(archives)} served an archive; ` +
      `the rest answered ${types.join(', ')}.`,
    url: quoted?.source_url ?? null,
    prefix: quoted === undefined ? null : str(quoted.observation['body_prefix']),
  }
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
