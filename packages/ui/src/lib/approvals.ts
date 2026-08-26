// Polling the read API for gates the harness is holding.
//
// Polling rather than the harness event stream because the gate opens once per case and a
// steward is reading the notice while it does. Four seconds is under the time it takes to read
// a draft, and the request is a single call that answers for every session at once.
import { useEffect, useState } from 'react'

import { type Approvals, api, type PendingApproval } from './api'

const EVERY_MS = 4000

const UNREAD: Approvals = {
  harness: false,
  pending: [],
  complete: false,
  sessions_scanned: 0,
  sessions_total: 0,
}

export function useApprovals(): Approvals {
  // Starts unread rather than empty: until the first answer lands, "nothing is waiting" is a
  // claim this app has not yet earned.
  const [state, setState] = useState<Approvals>(UNREAD)

  useEffect(() => {
    let live = true
    const read = () => {
      api
        .approvals()
        .then((next) => {
          if (live) setState(next)
        })
        .catch(() => {
          // The read API is down, so nothing can be said about what is waiting.
          if (live) setState(UNREAD)
        })
    }
    read()
    const timer = setInterval(read, EVERY_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  return state
}

/** The gate for one case, if the agent is waiting on this one. */
export function gateFor(approvals: Approvals, caseId: string): PendingApproval | null {
  return approvals.pending.find((gate) => gate.case_id === caseId) ?? null
}
