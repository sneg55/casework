// The notice. Facing columns for what the catalog asks for and what is actually there, the
// attribution with the evidence it rests on, then the message itself. Approve is not a button
// this app owns: the gate lives in the agent, and the reason it is closed is stated.
import { useCallback, useEffect, useState } from 'react'

import { Evidence } from '../components/Evidence'
import { Lamp } from '../components/Lamp'
import { api, type CaseDetail } from '../lib/api'
import { blockingReason, RUNS_REQUIRED } from '../lib/blocking'

function Facing({ detail }: { detail: CaseDetail }) {
  const members = detail.members.filter((m) => m.role === 'member')
  const corroborating = detail.members.filter((m) => m.role === 'corroborating')
  const finding = detail.attribution.at(0)
  return (
    <div className="facing">
      <section>
        <h3>What the catalog asks for</h3>
        <dl>
          <dt>Entries</dt>
          <dd>{members.length} feeds point here and are expected to serve a zip archive</dd>
          <dt>Cause key</dt>
          <dd className="mono">{detail.cause_key}</dd>
          <dt>Already answered</dt>
          <dd>
            {corroborating.length === 0
              ? 'no sibling entries'
              : `${corroborating.length} siblings the catalog has retired or re-pointed`}
          </dd>
        </dl>
      </section>
      <section>
        <h3>What is actually there</h3>
        <dl>
          <dt>Response</dt>
          <dd className="mono">{detail.status_class}</dd>
          <dt>Failing</dt>
          <dd>
            {detail.consecutive_runs} consecutive {detail.consecutive_runs === 1 ? 'run' : 'runs'},{' '}
            {detail.runs_needed === 0
              ? 'past the rule'
              : `${detail.runs_needed} more before anything is drafted`}
          </dd>
          <dt>Party</dt>
          <dd>
            {detail.party_kind}
            {detail.recipient_resolvable ? ', channel on file' : ', no channel on file'} ·
            confidence {detail.confidence} of 3
          </dd>
        </dl>
        {finding === undefined ? (
          <p className="finding">Not investigated yet. Ask the agent to attribute this case.</p>
        ) : (
          <p className="finding overprint">
            {finding.kind === 'repo' ? 'Repository read: ' : 'Checked: '}
            {finding.source_url === null ? null : (
              <a href={finding.source_url} target="_blank" rel="noreferrer">
                {finding.source_url}
              </a>
            )}
          </p>
        )}
      </section>
    </div>
  )
}

export function Case({ caseId, onBack }: { caseId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .case(caseId)
      .then(setDetail)
      .catch(() => {
        setDetail(null)
      })
  }, [caseId])

  useEffect(load, [load])

  if (detail === null) return <p className="status">Reading the notice…</p>

  const blocked = blockingReason(detail)
  const act = (fn: () => Promise<unknown>) => () => {
    setBusy(true)
    void fn()
      .then(load)
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <>
      <button type="button" className="back" onClick={onBack}>
        ← the register
      </button>

      <div className="notice-head">
        <h2>
          {detail.cause_kind.replaceAll('_', ' ')} <span className="subject">{detail.locator}</span>
        </h2>
        <div className="docket">
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

      <div className="bar">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={act(async () => await api.draft(caseId))}
        >
          {detail.draft === null ? 'Draft the message' : 'Redraft from evidence'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={act(async () => await api.decide(caseId, 'snooze'))}
        >
          Snooze
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={act(async () => await api.decide(caseId, 'reject'))}
        >
          Reject
        </button>
        <button type="button" disabled title="Approval is a gated tool call in the agent">
          Approve and send
        </button>
        <span className={blocked === null ? 'blocked clear' : 'blocked'}>
          {blocked ??
            `past ${String(RUNS_REQUIRED)} runs and drafted: ask the agent to send, and approve the gate prompt`}
        </span>
      </div>

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
          This screen cannot send. The only way a message leaves is a human approving the agent's
          gated call.
        </span>
      </p>
    </>
  )
}
