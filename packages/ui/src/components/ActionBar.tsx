// The decisions this screen can take, and the one it cannot. Redraft discards a revised
// message and reject closes the case, so both arm before they act: a second click on the same
// button, not a browser dialog, which would block the page.
import { useState } from 'react'

import { approvalRequest, askAgent } from '../lib/agent'
import { api, type CaseDetail } from '../lib/api'
import { blockingReasons, draftBlockedReasons, isTerminal } from '../lib/blocking'

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

/** Snooze and reject. Neither is offered once the case is closed, so the confirm on reject
 *  is not undone by an unguarded click on the button beside it. */
function Decisions({
  detail,
  disabled,
  armed,
  run,
}: {
  detail: CaseDetail
  disabled: boolean
  armed: string | null
  run: (name: string, fn: () => Promise<unknown>) => () => void
}) {
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={run('snooze', async () => await api.decide(detail.case_id, 'snooze'))}
      >
        Snooze
      </button>
      <button
        type="button"
        className={armed === 'reject' ? 'armed' : undefined}
        disabled={disabled}
        onClick={run('reject', async () => await api.decide(detail.case_id, 'reject'))}
      >
        {armed === 'reject' ? 'Confirm reject' : 'Reject'}
      </button>
    </>
  )
}

function draftLabel(armed: string | null, hasDraft: boolean): string {
  if (armed === 'redraft') return 'Confirm redraft'
  return hasDraft ? 'Redraft from evidence' : 'Draft the message'
}

export function ActionBar({ detail, onDone }: { detail: CaseDetail; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const blocked = blockingReasons(detail)
  const draftBlocked = draftBlockedReasons(detail)
  const hasDraft = detail.draft !== null
  // A confirm on reject protects nothing if an unguarded snooze walks the case back out of it.
  const closed = isTerminal(detail.state)

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
          disabled={busy !== null || draftBlocked.length > 0 || closed}
          title={draftBlocked.at(0) ?? undefined}
          onClick={run(draftName, async () => await api.draft(detail.case_id))}
        >
          {draftLabel(armed, hasDraft)}
        </button>
        <Decisions detail={detail} disabled={busy !== null || closed} armed={armed} run={run} />
        <button
          type="button"
          disabled={blocked.length > 0}
          title="Opens the agent with the request staged. It will stop at the gate, above this page."
          onClick={() => {
            askAgent(approvalRequest(detail.docket, detail.case_id))
          }}
        >
          Ask the agent to send
        </button>
        <span className={blocked.length === 0 ? 'blocked clear' : 'blocked'}>
          {blocked.length === 0
            ? 'the agent stops at the gate and this page asks you before anything leaves'
            : blocked.join('. And ')}
        </span>
      </div>
      <p className="working" role="status">
        {busy !== null
          ? (RUNNING.get(busy) ?? 'Working…')
          : armed !== null
            ? (ARMED.get(armed) ?? '')
            : ' '}
      </p>
    </>
  )
}
