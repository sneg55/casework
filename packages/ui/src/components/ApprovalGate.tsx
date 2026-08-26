// The one screen in this app where a human can let something out of the building.
//
// It does not send. It relays an answer to a call the harness has already suspended, which is
// the same item the harness's own chat posts. With no harness there is no suspended call and
// nothing here can be approved.
import { useState } from 'react'

import { api, type CaseDetail, type PendingApproval } from '../lib/api'

type Answering = 'idle' | 'allow' | 'deny' | 'done' | 'failed'

/** The API's message is concatenated after a full stop, so it starts one. */
function sentence(message: string | null): string {
  if (message === null || message === '') return ''
  return `${message.charAt(0).toUpperCase()}${message.slice(1)} `
}

function Recipient({ detail }: { detail: CaseDetail }) {
  return (
    <dl className="gate-what">
      <dt>Tool</dt>
      <dd className="mono">outreach.send</dd>
      <dt>Recipient</dt>
      <dd>
        {detail.draft?.recipient_kind ?? detail.party_kind}
        {detail.recipient_resolvable ? ', channel on file' : ', no channel on file'}
      </dd>
      <dt>Address</dt>
      <dd>read at send time, from a file this repository never holds</dd>
    </dl>
  )
}

export function ApprovalGate({
  gate,
  detail,
  onAnswered,
  onReload,
}: {
  gate: PendingApproval
  detail: CaseDetail
  onAnswered: () => void
  /** Re-reads the case. The draft-moved refusal is only actionable if this is offered. */
  onReload: () => void
}) {
  const [state, setState] = useState<Answering>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const [answered, setAnswered] = useState<'allow' | 'deny' | null>(null)

  const answer = (status: 'allow' | 'deny') => {
    setState(status)
    api
      .answer(
        gate,
        status,
        detail.draft?.generated_at,
        status === 'deny' ? 'The steward declined at the gate.' : undefined,
      )
      .then((result) => {
        if (result.error !== undefined) {
          setFailure(result.error)
          setState('failed')
          return
        }
        setAnswered(status)
        setState('done')
        onAnswered()
      })
      .catch((error: unknown) => {
        setFailure(String(error))
        setState('failed')
      })
  }

  if (state === 'done') {
    return (
      <div className="gate settled">
        <h3>{answered === 'allow' ? 'Approved' : 'Denied'}</h3>
        <p>
          {answered === 'allow'
            ? 'The harness has the approval, the turn resumed, and the message was written to data/outbox. The case below records who approved it.'
            : 'The harness has the refusal and the turn resumed. Nothing was sent. The refusal is recorded against the case below, which stays where it was.'}
        </p>
      </div>
    )
  }

  const working = state === 'allow' || state === 'deny'
  return (
    <div className="gate">
      <h3>The agent is waiting on you</h3>
      <p className="gate-lede">
        It has stopped inside the harness, before the call, and cannot proceed on its own. Nothing
        has been sent.
      </p>

      <Recipient detail={detail} />

      {gate.said === '' ? null : <p className="gate-said">{gate.said}</p>}

      {detail.draft === null ? (
        <p className="none">No draft is on file for this case, which should not happen here.</p>
      ) : (
        <div className="gate-draft">
          <p className="subject-line">{detail.draft.subject}</p>
          <pre>{detail.draft.body}</pre>
        </div>
      )}

      <div className="gate-actions">
        <button
          type="button"
          className="allow"
          disabled={working}
          onClick={() => {
            answer('allow')
          }}
        >
          {state === 'allow' ? 'Approving…' : 'Approve the send'}
        </button>
        <button
          type="button"
          className="deny"
          disabled={working}
          onClick={() => {
            answer('deny')
          }}
        >
          {state === 'deny' ? 'Denying…' : 'Deny'}
        </button>
        <span className="gate-note">
          Denying records the refusal against the case and leaves the case where it is.
        </span>
      </div>

      {state === 'failed' ? (
        <p className="status">
          The decision did not reach the harness, so the call is still suspended.{' '}
          {sentence(failure)}
          <button
            type="button"
            className="retry"
            onClick={() => {
              setFailure(null)
              setState('idle')
              onReload()
            }}
          >
            Re-read this case
          </button>
        </p>
      ) : null}
    </div>
  )
}
