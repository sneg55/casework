// The decisions this screen can take, and the one it cannot. Redraft discards a revised
// message and reject cannot be undone from here, so both arm before they act: a second click
// on the same button, not a browser dialog, which would block the page.
import { useState } from 'react'

import { approvalRequest, askAgent } from '../lib/agent'
import { api, type CaseDetail } from '../lib/api'
import { blockingReason, draftBlockedReason } from '../lib/blocking'

const ARMED = new Map([
  ['redraft', 'Click again to replace the message'],
  ['reject', 'Click again to reject this case'],
])

const RUNNING = new Map([
  ['draft', 'Composing the message from the observations above…'],
  ['redraft', 'Composing the message from the observations above…'],
  ['snooze', 'Recording the decision…'],
  ['reject', 'Recording the decision…'],
])

export function ActionBar({ detail, onDone }: { detail: CaseDetail; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const blocked = blockingReason(detail)
  const draftBlocked = draftBlockedReason(detail)
  const hasDraft = detail.draft !== null

  const run = (name: string, fn: () => Promise<unknown>) => () => {
    if (ARMED.has(name) && armed !== name) {
      setArmed(name)
      return
    }
    setArmed(null)
    setBusy(name)
    void fn()
      .then(onDone)
      .finally(() => {
        setBusy(null)
      })
  }

  const draftName = hasDraft ? 'redraft' : 'draft'
  return (
    <>
      <div className="bar">
        <button
          type="button"
          className={armed === 'redraft' ? 'primary armed' : 'primary'}
          disabled={busy !== null || draftBlocked !== null}
          title={draftBlocked ?? undefined}
          onClick={run(draftName, async () => await api.draft(detail.case_id))}
        >
          {armed === 'redraft'
            ? 'Confirm redraft'
            : hasDraft
              ? 'Redraft from evidence'
              : 'Draft the message'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={run('snooze', async () => await api.decide(detail.case_id, 'snooze'))}
        >
          Snooze
        </button>
        <button
          type="button"
          className={armed === 'reject' ? 'armed' : undefined}
          disabled={busy !== null}
          onClick={run('reject', async () => await api.decide(detail.case_id, 'reject'))}
        >
          {armed === 'reject' ? 'Confirm reject' : 'Reject'}
        </button>
        <button
          type="button"
          disabled={blocked !== null}
          title="Opens the agent with the request staged. The gate itself is the harness's."
          onClick={() => {
            askAgent(approvalRequest(detail.docket, detail.case_id))
          }}
        >
          Approve and send
        </button>
        <span className={blocked === null ? 'blocked clear' : 'blocked'}>
          {blocked ?? 'this opens the agent; approving its gate prompt is what sends'}
        </span>
      </div>
      <p className="working" role="status">
        {busy !== null
          ? (RUNNING.get(busy) ?? 'Working…')
          : armed !== null
            ? (ARMED.get(armed) ?? '')
            : ' '}
      </p>
    </>
  )
}
