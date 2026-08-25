// Why the gate is closed, in the product's own language and in the order the server checks it,
// so the screen never says "ready" about something outreach.send would refuse.
import type { CaseDetail, QueueCase } from './api'

export const RUNS_REQUIRED = 3

/** Terminal states: the case is closed and the buttons that would reopen it are not offered. */
export function isTerminal(state: string): boolean {
  return state === 'approved' || state === 'rejected'
}

/**
 * Section 10: no draft before three runs, and no draft against an unattributed case. Both are
 * returned, because clearing the run counter on a case nobody attributed only reveals the
 * second refusal, and a reader who was shown one blocker reads it as the only one.
 */
export function draftBlockedReasons(detail: CaseDetail): string[] {
  const reasons: string[] = []
  if (detail.consecutive_runs < RUNS_REQUIRED) {
    reasons.push(
      `the three-run rule has not fired: ${String(detail.consecutive_runs)} of ${String(RUNS_REQUIRED)} consecutive runs`,
    )
  }
  if (detail.confidence === 0) {
    reasons.push('nothing has been attributed here, so there is no party to write to')
  }
  return reasons
}

export function blockingReasons(detail: CaseDetail): string[] {
  if (detail.state === 'approved') return ['already approved; a message was written to the outbox']
  if (detail.state === 'rejected') return ['rejected, so nothing will be sent']
  const beforeDraft = draftBlockedReasons(detail)
  if (beforeDraft.length > 0) return beforeDraft
  if (!detail.recipient_resolvable) return [`no channel on file for a ${detail.party_kind}`]
  if (detail.draft === null) return ['no message drafted yet']
  return []
}

/**
 * A case leaves the queue two ways, and only one of them is somebody's decision: the store
 * marks a case `resolved` on its own when it stops appearing in a run. Calling that a decision
 * credits a steward with a call they never made.
 */
function nothingOpen(cases: QueueCase[]): string {
  const decided = cases.filter(
    (row) => row.state === 'snoozed' || row.state === 'approved' || row.state === 'rejected',
  ).length
  const resolved = cases.filter((row) => row.state === 'resolved').length
  const parts: string[] = []
  if (decided > 0) parts.push(`${String(decided)} decided`)
  if (resolved > 0) {
    parts.push(
      `${String(resolved)} stopped failing and closed ${resolved === 1 ? 'itself' : 'themselves'}`,
    )
  }
  if (parts.length === 0) return 'Nothing is ready, and no case is open.'
  return `Nothing is ready: ${parts.join(', and ')}.`
}

/**
 * An empty Ready tab is not an empty filter: it is the three-run rule and the attribution
 * counter doing their job. Say which, counted off the cases rather than asserted, so the
 * reader knows whether to capture another run or to attribute what is already there.
 */
export function whyNothingIsReady(cases: QueueCase[]): string | null {
  if (cases.length === 0) return null
  const open = cases.filter((row) => row.state === 'watching' || row.state === 'ready')
  if (open.length === 0) return nothingOpen(cases)

  const short = open.filter((row) => row.runs_needed > 0)
  const unattributed = open.filter((row) => row.runs_needed === 0 && row.confidence === 0)
  const parts: string[] = []
  if (short.length > 0) {
    const nearest = Math.min(...short.map((row) => row.runs_needed))
    parts.push(
      `${String(short.length)} of ${String(open.length)} are short of the three-run rule, the nearest by ${String(nearest)} ${nearest === 1 ? 'run' : 'runs'}`,
    )
  }
  if (unattributed.length > 0) {
    parts.push(`${String(unattributed.length)} are past the rule with nothing attributed to them`)
  }
  if (parts.length === 0) return null
  return `Nothing is ready yet: ${parts.join(', and ')}.`
}
