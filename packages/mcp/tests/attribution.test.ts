// Section 9 gives every cause kind an investigation. These are the ones that read the
// response again rather than a third-party API, so they can be tested without the network:
// the re-probe is faked and only the reasoning over it is under test.
import { describe, expect, it, vi } from 'vitest'

import { CAUSE_KINDS, PARTY_FOR_CAUSE } from '../src/constants/enums.js'
import type { Detection } from '../src/schemas/caseDocument.js'

const reprobeFeeds = vi.hoisted(() => vi.fn())
vi.mock('../src/services/sandbox.js', () => ({ reprobeFeeds, replayRun: vi.fn() }))

const { investigateFor } = await import('../src/features/attribution/attribute.js')

function detection(over: Partial<Detection> = {}): Detection {
  return {
    run_date: '2026-08-25',
    observed_at: '2026-08-25T00:00:00+00:00',
    feed_id: '1',
    provider: 'Example Transit',
    url: 'https://gtfs.calitp.org/production/ExampleGTFS.zip',
    host: 'gtfs.calitp.org',
    path: '/production/ExampleGTFS.zip',
    status_class: 'content_type_mismatch',
    healthy: false,
    http_code: 206,
    content_type: 'text/html; charset=utf-8',
    magic_ok: false,
    body_prefix: '<!DOCTYPE html><html lang="en">',
    tls_ok: true,
    latency_ms: 120,
    attempts: 1,
    auth_type: '0',
    catalog_status: '',
    redirect_id: '',
    contact_on_file: false,
    ...over,
  }
}

const view = (over = {}) => ({ locator: 'gtfs.calitp.org', case_id: 'abc123abc123', ...over })

describe('the investigations that re-read the response', () => {
  it('records what the platform actually served, with the bytes it began with', async () => {
    reprobeFeeds.mockResolvedValueOnce([detection(), detection({ feed_id: '2' })])
    const result = await investigateFor('content_type_mismatch', view(), ['1', '2'])

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]?.kind).toBe('http')
    expect(result.rows[0]?.observation).toMatchObject({
      content_type: 'text/html; charset=utf-8',
      magic_ok: false,
      body_prefix: '<!DOCTYPE html><html lang="en">',
    })
    expect(result.finding).toContain('0 served an archive')
    expect(result.finding).toContain('text/html')
  })

  it('says so when a re-fetch shows the platform serving an archive after all', async () => {
    reprobeFeeds.mockResolvedValueOnce([
      detection({ status_class: 'ok', healthy: true, magic_ok: true, body_prefix: 'PK..' }),
    ])
    const result = await investigateFor('content_type_mismatch', view(), ['1'])
    expect(result.finding).toContain('1 served an archive')
  })

  it('separates a host that failed twice from one that caught a flap', async () => {
    reprobeFeeds.mockResolvedValueOnce([detection({ status_class: 'timeout' })])
    const failed = await investigateFor('host_unreachable', view(), ['1'])
    expect(failed.finding).toContain('failed again')
    expect(failed.finding).toContain('timeout')

    reprobeFeeds.mockResolvedValueOnce([detection({ status_class: 'ok', healthy: true })])
    const flap = await investigateFor('host_unreachable', view(), ['1'])
    expect(flap.finding).toContain('may have caught a flap')
  })

  it('samples a group instead of re-fetching every member of it', async () => {
    reprobeFeeds.mockResolvedValueOnce([detection()])
    await investigateFor('content_type_mismatch', view(), ['1', '2', '3', '4', '5', '6', '7'])
    expect(reprobeFeeds).toHaveBeenLastCalledWith(['1', '2', '3', '4', '5'])
  })

  it('says nothing answered when the re-probe comes back empty', async () => {
    reprobeFeeds.mockResolvedValueOnce([])
    const result = await investigateFor('content_type_mismatch', view(), ['1'])
    expect(result.rows).toHaveLength(0)
    expect(result.finding).toContain('answered the second fetch')
  })

  it('leaves the agency cause kinds without an external check, and says which', async () => {
    const before = reprobeFeeds.mock.calls.length
    for (const kind of ['path_not_found', 'individual'] as const) {
      const result = await investigateFor(kind, view(), ['1'])
      expect(result.rows).toHaveLength(0)
      expect(result.finding).toBe('no external investigation for this cause kind')
    }
    // A cause nobody can attribute must not cost a network round trip to learn that.
    expect(reprobeFeeds.mock.calls.length).toBe(before)
  })

  it('still maps every cause kind in the enum to exactly one party', () => {
    const mapped = new Map(Object.entries(PARTY_FOR_CAUSE))
    for (const kind of CAUSE_KINDS) expect(mapped.get(kind)).toBeDefined()
  })
})
