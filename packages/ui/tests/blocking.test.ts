// The screen's refusals. These are the sentences a steward reads instead of a sent message,
// so they are tested for what they say, not only for whether they are non-empty.
import { describe, expect, it } from 'vitest'

import type { CaseDetail, QueueCase } from '../src/lib/api'
import {
  blockingReasons,
  draftBlockedReasons,
  isTerminal,
  whyNothingIsReady,
} from '../src/lib/blocking'

function queueCase(over: Partial<QueueCase> = {}): QueueCase {
  return {
    case_id: 'abc123abc123',
    docket: 'CW-0001',
    cause_kind: 'content_type_mismatch',
    locator: 'gtfs.calitp.org',
    agency_count: 5,
    corroborating_count: 0,
    party_kind: 'host_operator',
    recipient_resolvable: true,
    confidence: 3,
    consecutive_runs: 3,
    runs_needed: 0,
    state: 'watching',
    ...over,
  }
}

function detail(over: Partial<CaseDetail> = {}): CaseDetail {
  return {
    ...queueCase(),
    cause_key: 'gtfs.calitp.org|content_type_mismatch',
    status_class: 'content_type_mismatch',
    first_seen: '2026-08-24',
    last_seen: '2026-08-25',
    members: [],
    evidence: [],
    attribution: [],
    draft: null,
    decisions: [],
    ...over,
  }
}

describe('why the gate is closed', () => {
  it('names both blockers, because clearing one only reveals the other', () => {
    const reasons = draftBlockedReasons(detail({ consecutive_runs: 2, confidence: 0 }))
    expect(reasons).toHaveLength(2)
    expect(reasons[0]).toContain('2 of 3 consecutive runs')
    expect(reasons[1]).toContain('no party to write to')
  })

  it('counts the runs it has, not the runs it needs', () => {
    expect(draftBlockedReasons(detail({ consecutive_runs: 1 }))[0]).toContain('1 of 3')
  })

  it('stops blocking the draft once the rule fires against an attributed case', () => {
    expect(draftBlockedReasons(detail())).toEqual([])
  })

  it('still blocks sending when there is no channel or no message', () => {
    expect(blockingReasons(detail({ recipient_resolvable: false }))).toEqual([
      'no channel on file for a host_operator',
    ])
    expect(blockingReasons(detail())).toEqual(['no message drafted yet'])
  })

  it('says a decided case is decided, and does not also recite the run counter', () => {
    expect(blockingReasons(detail({ state: 'rejected', consecutive_runs: 1 }))).toEqual([
      'rejected, so nothing will be sent',
    ])
  })

  it('treats approved and rejected as terminal, and watching as open', () => {
    expect(isTerminal('rejected')).toBe(true)
    expect(isTerminal('approved')).toBe(true)
    expect(isTerminal('watching')).toBe(false)
    expect(isTerminal('snoozed')).toBe(false)
  })
})

describe('why the ready tab is empty', () => {
  it('blames the run counter, and says how near the nearest case is', () => {
    const said = whyNothingIsReady([
      queueCase({ runs_needed: 1, consecutive_runs: 2 }),
      queueCase({ runs_needed: 2, consecutive_runs: 1 }),
    ])
    expect(said).toContain('2 of 2 are short of the three-run rule')
    expect(said).toContain('the nearest by 1 run')
  })

  it('separates the cases past the rule that nobody attributed', () => {
    const said = whyNothingIsReady([
      queueCase({ runs_needed: 1, consecutive_runs: 2 }),
      queueCase({ runs_needed: 0, confidence: 0 }),
    ])
    expect(said).toContain('short of the three-run rule')
    expect(said).toContain('1 are past the rule with nothing attributed')
  })

  it('says so when every case has been decided rather than blaming a rule', () => {
    expect(whyNothingIsReady([queueCase({ state: 'rejected' })])).toBe(
      'Nothing is ready: 1 decided.',
    )
  })

  // The store sets `resolved` on its own when a case stops appearing in a run. Calling that a
  // decision credits a steward with a call they never made.
  it('does not call an automatically resolved case a decision', () => {
    const said = whyNothingIsReady([queueCase({ state: 'resolved' })])
    expect(said).toContain('stopped failing and closed itself')
    expect(said).not.toContain('decided')
  })

  it('separates the cases somebody decided from the ones that closed themselves', () => {
    const said = whyNothingIsReady([
      queueCase({ state: 'rejected' }),
      queueCase({ state: 'snoozed' }),
      queueCase({ state: 'resolved' }),
    ])
    expect(said).toBe('Nothing is ready: 2 decided, and 1 stopped failing and closed itself.')
  })

  it('claims nothing about decisions when the run produced no cases at all', () => {
    expect(whyNothingIsReady([])).toBeNull()
  })

  it('falls back to the generic message when no rule explains the emptiness', () => {
    expect(whyNothingIsReady([queueCase({ runs_needed: 0, confidence: 3 })])).toBeNull()
  })
})
