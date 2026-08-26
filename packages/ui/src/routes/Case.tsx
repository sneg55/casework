// The notice. Facing columns for what the catalog asks for and what is actually there, the
// attribution with the evidence it rests on, then the message itself. When the harness has a
// suspended outreach.send for this case, the gate goes above all of it.
import { useCallback, useEffect, useRef, useState } from 'react'

import { ActionBar } from '../components/ActionBar'
import { ApprovalGate } from '../components/ApprovalGate'
import { Attribution } from '../components/Attribution'
import { Evidence } from '../components/Evidence'
import { Lamp } from '../components/Lamp'
import { api, type CaseDetail, type PendingApproval } from '../lib/api'
import { gateFor, useApprovals } from '../lib/approvals'
import { count, verb, words } from '../lib/words'

function Back({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="back" onClick={onBack}>
      ← the register
    </button>
  )
}

function Facing({ detail }: { detail: CaseDetail }) {
  const members = detail.members.filter((m) => m.role === 'member')
  const corroborating = detail.members.filter((m) => m.role === 'corroborating')
  return (
    <div className="facing">
      <section>
        <h3>What the catalog asks for</h3>
        <dl>
          <dt>Entries</dt>
          <dd>
            {count(members.length, 'feed')} {verb(members.length, 'point')} here and{' '}
            {verb(members.length, 'are', 'is')} expected to serve a zip archive
          </dd>
          <dt>Cause key</dt>
          <dd className="mono">{detail.cause_key}</dd>
          <dt>Already answered</dt>
          <dd>
            {corroborating.length === 0
              ? 'no sibling entries'
              : `${count(corroborating.length, 'sibling')} the catalog has retired or re-pointed`}
          </dd>
        </dl>
      </section>
      <section>
        <h3>What is actually there</h3>
        <dl>
          <dt>Response</dt>
          <dd>{words(detail.status_class)}</dd>
          <dt>Failing</dt>
          <dd>
            {detail.consecutive_runs} consecutive {detail.consecutive_runs === 1 ? 'run' : 'runs'},{' '}
            {detail.runs_needed === 0
              ? 'past the rule'
              : `${detail.runs_needed} more before anything is drafted`}
          </dd>
          <dt>Party</dt>
          <dd>
            {words(detail.party_kind)}
            {detail.recipient_resolvable ? ', channel on file' : ', no channel on file'} ·
            confidence {detail.confidence} of 3
          </dd>
        </dl>
        <Attribution detail={detail} />
      </section>
    </div>
  )
}

export function Case({ caseId, onBack }: { caseId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const approvals = useApprovals()

  const load = useCallback(() => {
    api
      .case(caseId)
      .then((next) => {
        setDetail(next)
        setError(null)
      })
      .catch((e: unknown) => {
        setError(String(e))
      })
  }, [caseId])

  useEffect(load, [load])

  // The gate leaves the poll the moment the harness takes the answer, so the panel that reports
  // what happened would unmount about four seconds after it appeared. Hold the answered call
  // until the steward leaves the case.
  const [held, setHeld] = useState<PendingApproval | null>(null)
  const live = detail === null ? null : gateFor(approvals, detail.case_id)
  useEffect(() => {
    setHeld((previous) => live ?? previous)
  }, [live])
  useEffect(() => {
    setHeld(null)
  }, [caseId])

  // The harness resumes the turn only after it has taken the answer, and `outreach.send` moves
  // the case after that. Re-read when the gate clears, or the notice behind the settled panel
  // keeps the state it had before the approval.
  const liveId = live?.tool_call_id ?? null
  const previousId = useRef<string | null>(null)
  useEffect(() => {
    if (previousId.current !== null && liveId === null) load()
    previousId.current = liveId
  }, [liveId, load])

  if (error !== null) {
    return (
      <>
        <Back onBack={onBack} />
        <p className="status">
          Case {caseId} did not load. Either no case has that id in the current run, or the read API
          is not answering: start it with <code>npm run api -w @casework/mcp</code> and try again.
          <br />
          {error}
        </p>
        <button type="button" className="retry" onClick={load}>
          Try again
        </button>
      </>
    )
  }
  if (detail === null) {
    return (
      <>
        <Back onBack={onBack} />
        <p className="status">Reading the notice…</p>
      </>
    )
  }

  const gate = live ?? held

  return (
    <>
      <Back onBack={onBack} />

      {/* Keyed on the call: a second gate on the same case must arrive on a fresh component,
          not inherit the first one's answered state. */}
      {gate === null ? null : (
        <ApprovalGate
          key={gate.tool_call_id}
          gate={gate}
          detail={detail}
          onAnswered={load}
          onReload={load}
        />
      )}

      <div className="notice-head">
        <h2>
          {words(detail.cause_kind)} <span className="subject">{detail.locator}</span>
        </h2>
        <div className="docket">
          <span className="number">{detail.docket}</span>
          <br />
          case {detail.case_id}
          <br />
          <Lamp state={detail.state} />
          {detail.state} · seen {detail.first_seen} to {detail.last_seen}
        </div>
      </div>

      <Facing detail={detail} />

      <h2 className="sec">Every observation behind this case</h2>
      <Evidence rows={detail.evidence} />

      <h2 className="sec">The message</h2>
      <div className="draft overprint-late">
        {detail.draft === null ? (
          <p className="none">
            No message drafted yet. Drafting composes it from the observations above; it invents
            nothing.
          </p>
        ) : (
          <>
            <p className="subject-line">{detail.draft.subject}</p>
            <pre>{detail.draft.body}</pre>
          </>
        )}
      </div>

      <ActionBar detail={detail} onDone={load} />

      <p className="ledger">
        {detail.decisions.length === 0 ? (
          <span>Nobody has acted on this case.</span>
        ) : (
          detail.decisions.map((decision) => (
            <span key={decision.at}>
              {decision.action} by {decision.actor}, {decision.at}
            </span>
          ))
        )}
        <span>
          This screen cannot send. It can only answer a call the harness has already suspended,
          which is a different thing: if the harness is holding nothing, there is nothing here to
          approve.
        </span>
      </p>
    </>
  )
}
