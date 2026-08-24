// The case. Four blocks: what the catalog asks for, what is actually there, attribution with
// its evidence, and the draft. Approve is not a button this app can press: the gate lives in
// the agent, and the reason it is disabled is stated rather than implied.
import { useCallback, useEffect, useState } from 'react'
import { Evidence } from '../components/Evidence'
import { api, type CaseDetail } from '../lib/api'

function why(detail: CaseDetail): string | null {
  if (detail.consecutive_runs < 3) {
    return `the three-run rule has not fired: ${detail.consecutive_runs} of 3 consecutive runs`
  }
  if (detail.confidence === 0) return 'unattributed, so there is no party to write to'
  if (!detail.recipient_resolvable) return `no channel on file for a ${detail.party_kind}`
  if (detail.draft === null) return 'no draft yet'
  return null
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

  if (detail === null) return <p className="note">Reading the case…</p>

  const members = detail.members.filter((m) => m.role === 'member')
  const corroborating = detail.members.filter((m) => m.role === 'corroborating')
  const blocked = why(detail)

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
        ← the queue
      </button>

      <h2 style={{ margin: '12px 0 4px', fontSize: 18 }}>
        {detail.cause_kind.replaceAll('_', ' ')} on <span className="mono">{detail.locator}</span>
      </h2>
      <p className="note">
        Case {detail.case_id}. First seen {detail.first_seen}, last seen {detail.last_seen}.{' '}
        <span className={`pill ${detail.state}`}>{detail.state}</span>
      </p>

      <div className="blocks">
        <div className="block">
          <h3>What the catalog asks for</h3>
          <dl>
            <dt>Feeds</dt>
            <dd>{members.length} entries point here and are expected to serve a zip archive</dd>
            <dt>Cause key</dt>
            <dd className="mono">{detail.cause_key}</dd>
            <dt>Already retired</dt>
            <dd>
              {corroborating.length === 0
                ? 'none'
                : `${corroborating.length} sibling entries the catalog has already answered`}
            </dd>
          </dl>
        </div>

        <div className="block">
          <h3>What is actually there</h3>
          <dl>
            <dt>Response</dt>
            <dd className="mono">{detail.status_class}</dd>
            <dt>Runs failing</dt>
            <dd>
              {detail.consecutive_runs} consecutive, {detail.runs_needed} more before anything is
              drafted
            </dd>
            <dt>Observations</dt>
            <dd>{detail.evidence.length} recorded for this run</dd>
          </dl>
        </div>

        <div className="block">
          <h3>Attribution</h3>
          <dl>
            <dt>Party</dt>
            <dd>{detail.party_kind}</dd>
            <dt>Channel</dt>
            <dd>{detail.recipient_resolvable ? 'on file' : 'none on file'}</dd>
            <dt>Confidence</dt>
            <dd>{detail.confidence} of 3, counted</dd>
          </dl>
          {detail.attribution.map((row) => (
            <p className="note" key={row.kind + row.observation.slice(0, 24)}>
              <strong>{row.kind}</strong>{' '}
              {row.source_url === null ? null : (
                <a href={row.source_url} target="_blank" rel="noreferrer">
                  {row.source_url}
                </a>
              )}
            </p>
          ))}
        </div>

        <div className="block">
          <h3>Decisions</h3>
          {detail.decisions.length === 0 ? (
            <p className="note">Nobody has acted on this case.</p>
          ) : (
            <dl>
              {detail.decisions.map((d) => (
                <>
                  <dt key={`${d.at}-k`}>{d.action}</dt>
                  <dd key={`${d.at}-v`}>
                    {d.actor}, {d.at}
                  </dd>
                </>
              ))}
            </dl>
          )}
        </div>
      </div>

      <div className="section-title">Every observation behind this case</div>
      <Evidence rows={detail.evidence} />

      <div className="section-title">The draft</div>
      {detail.draft === null ? (
        <p className="note">No draft yet.</p>
      ) : (
        <pre className="draft">
          {detail.draft.subject}
          {'\n\n'}
          {detail.draft.body}
        </pre>
      )}

      <div className="bar">
        <button type="button" disabled={busy} onClick={act(async () => await api.draft(caseId))}>
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
        <button type="button" disabled title="Approval happens in the agent, behind the gate">
          Approve and send
        </button>
        <span className="why">
          {blocked ?? 'ready: ask the agent to send, and approve the gate prompt'}
        </span>
      </div>
      <p className="note">
        This screen cannot send. Approval is a gated tool call in the agent, so the only way a
        message leaves is a human approving that call.
      </p>
    </>
  )
}
