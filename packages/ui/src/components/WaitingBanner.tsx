// What the agent is waiting on, at the top of the register, so nobody has to open every case
// to find the one that stopped.
import type { Approvals, QueueCase } from '../lib/api'

function docketOf(cases: QueueCase[], caseId: string | null): string {
  return cases.find((row) => row.case_id === caseId)?.docket ?? 'a case'
}

export function WaitingBanner({
  approvals,
  cases,
  onOpen,
}: {
  approvals: Approvals
  cases: QueueCase[]
  onOpen: (caseId: string) => void
}) {
  // Not the same as nothing waiting: the harness could be holding a call nobody can see.
  if (!approvals.harness) {
    return (
      <div className="waiting unseen">
        <span className="waiting-lamp" aria-hidden="true" />
        <p>
          The harness is not answering, so whether the agent is waiting on you cannot be read.
          Approving needs it: the suspended call is the harness's, not this app's.
        </p>
      </div>
    )
  }

  if (approvals.pending.length === 0) {
    if (approvals.complete) return null
    return (
      <div className="waiting unseen">
        <span className="waiting-lamp" aria-hidden="true" />
        <p>
          Nothing is waiting in the {approvals.sessions_scanned} most recent sessions, but there are{' '}
          {approvals.sessions_total}. An older gate would not appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="waiting">
      <span className="waiting-lamp" aria-hidden="true" />
      <p>
        The agent has stopped and is waiting on you.{' '}
        {approvals.pending.length === 1
          ? 'One call is suspended.'
          : `${String(approvals.pending.length)} calls are suspended.`}{' '}
        Nothing has been sent.
      </p>
      <ul>
        {approvals.pending.map((gate) => (
          <li key={gate.tool_call_id}>
            <button
              type="button"
              disabled={gate.case_id === null}
              onClick={() => {
                if (gate.case_id !== null) onOpen(gate.case_id)
              }}
            >
              {gate.tool_name} on {docketOf(cases, gate.case_id)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
