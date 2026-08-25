// Every sentence here is a claim about an observation, and the case page is where a steward
// decides whether to write to an outside organisation. A number that is not in the
// observation must not appear in the sentence.
import { describe, expect, it } from 'vitest'

import {
  certificate,
  type Parsed,
  parseRows,
  redirects,
  repository,
  served,
} from '../src/lib/attribution'

const parsed = (kind: string, observation: object, source_url: string | null = null): Parsed => ({
  kind,
  source_url,
  observation: observation as Record<string, unknown>,
})

describe('reading the stored observations', () => {
  it('drops a malformed row instead of blanking the case page', () => {
    const rows = parseRows([
      { kind: 'http', observation: 'not json', source_url: null },
      { kind: 'http', observation: '{"feed_id":"1"}', source_url: null },
      { kind: 'http', observation: 'null', source_url: null },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.observation['feed_id']).toBe('1')
  })
})

describe('what the platform served', () => {
  it('counts the archives and names the types that came back instead', () => {
    const facts = served(
      [
        parsed('http', { magic_ok: false, content_type: 'text/html; charset=utf-8' }),
        parsed('http', { magic_ok: false, content_type: 'text/html; charset=utf-8' }),
      ],
      'gtfs.calitp.org',
    )
    expect(facts.line).toBe(
      'Re-fetched 2 of gtfs.calitp.org. None served an archive; the rest answered text/html; charset=utf-8.',
    )
  })

  it('says so when a re-fetch did serve an archive after all', () => {
    const facts = served([parsed('http', { magic_ok: true, content_type: 'application/zip' })], 'h')
    expect(facts.line).toContain('1 served an archive')
  })

  it('quotes the first row that actually carries a body prefix', () => {
    const facts = served(
      [
        parsed('http', { magic_ok: false, content_type: 'text/html' }),
        parsed(
          'http',
          { magic_ok: false, content_type: 'text/html', body_prefix: '<!DOCTYPE' },
          'https://h/a.zip',
        ),
      ],
      'h',
    )
    expect(facts.prefix).toBe('<!DOCTYPE')
    expect(facts.url).toBe('https://h/a.zip')
  })

  it('offers no bytes when the run predates the body prefix', () => {
    const facts = served([parsed('http', { magic_ok: false, content_type: 'text/html' })], 'h')
    expect(facts.prefix).toBeNull()
  })
})

describe('what the repository shows', () => {
  // paths_present is every top-level directory in the repository, dotfiles included. Adding it
  // to paths_missing states a count of catalog-referenced directories that is not true.
  it('never invents a denominator out of the directories that happen to be there', () => {
    const facts = repository(
      parsed('repo', {
        owner: 'LACMTA',
        repo: 'los-angeles-regional-gtfs',
        exists: true,
        archived: false,
        pushed_at: '2026-08-23T01:29:55Z',
        paths_missing: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        paths_present: ['.github', '.scripts', '.validation', 'lacmta', 'lacmta-rail', 'lapuente'],
      }),
    )
    expect(facts.line).toContain('7 directories the catalog references are gone')
    expect(facts.line).not.toContain('13')
    expect(facts.line).not.toContain('of the')
    expect(facts.missing).toHaveLength(7)
  })

  it('reads one missing directory as one, not as 1 directories', () => {
    const facts = repository(parsed('repo', { owner: 'o', repo: 'r', paths_missing: ['only'] }))
    expect(facts.line).toContain('One directory the catalog references is gone')
  })

  it('separates an archived repository from a deleted one', () => {
    expect(repository(parsed('repo', { archived: true, paths_missing: [] })).line).toContain(
      'is archived',
    )
    expect(repository(parsed('repo', { exists: false, paths_missing: [] })).line).toContain(
      'is gone or private',
    )
  })
})

describe('what the siblings show', () => {
  it('counts only the replacements that were observed serving', () => {
    const facts = redirects([
      parsed('redirect', { from_feed_id: '1', replacement_healthy: true, note: 'serving' }),
      parsed('redirect', { from_feed_id: '2', replacement_healthy: null, note: 'not probed' }),
      parsed('redirect', { from_feed_id: '3', replacement_healthy: true, note: 'serving' }),
    ])
    expect(facts.line).toContain('2 of 3 sampled siblings')
    expect(facts.notes).toHaveLength(3)
  })
})

describe('what the certificate shows', () => {
  it('reports a failed handshake as a failed handshake', () => {
    expect(certificate(parsed('tls', { reachable: false }, 'https://h'))).toContain(
      'did not complete a handshake',
    )
  })

  it('names the issuer and the expiry when the handshake completed', () => {
    const said = certificate(
      parsed('tls', { reachable: true, subject: 'h', issuer: 'R3', valid_to: '2026-09-01' }),
    )
    expect(said).toContain('issued by R3')
    expect(said).toContain('expires 2026-09-01')
  })
})
