// Why the gate is closed, in the product's own language and in the order the server checks it,
// so the screen never says "ready" about something outreach.send would refuse.
import type { CaseDetail } from './api'

export const RUNS_REQUIRED = 3

export function blockingReason(detail: CaseDetail): string | null {
  if (detail.state === 'approved') return 'already approved; a message was written to the outbox'
  if (detail.state === 'rejected') return 'rejected, so nothing will be sent'
  if (detail.consecutive_runs < RUNS_REQUIRED) {
    return `the three-run rule has not fired: ${String(detail.consecutive_runs)} of ${String(RUNS_REQUIRED)} consecutive runs`
  }
  if (detail.confidence === 0) return 'unattributed, so there is no party to write to'
  if (!detail.recipient_resolvable) return `no channel on file for a ${detail.party_kind}`
  if (detail.draft === null) return 'no message drafted yet'
  return null
}
