// Polling the read API for gates the harness is holding.
//
// Polling rather than the harness event stream because the gate opens once per case and a
// steward is reading the notice while it does. Four seconds is under the time it takes to read
// a draft, and the request is a single call that answers for every session at once.
import { useEffect, useState } from 'react'

import { type Approvals, api, type PendingApproval } from './api'

const EVERY_MS = 4000

export function useApprovals(): Approvals {
  const [state, setState] = useState<Approvals>({ harness: true, pending: [] })

  useEffect(() => {
    let live = true
    const read = () => {
      api
        .approvals()
        .then((next) => {
          if (live) setState(next)
        })
        .catch(() => {
          // The read API is down, which its own error surface already reports.
          if (live) setState({ harness: false, pending: [] })
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
