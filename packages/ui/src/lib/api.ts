// Everything the screens read. One place, so a route never hand-rolls a fetch and the API
// base is configurable for the demo.
const configured: unknown = import.meta.env['VITE_CASEWORK_API']
export const API = typeof configured === 'string' ? configured : 'http://localhost:8791'

export interface QueueCase {
  case_id: string
  docket: string
  cause_kind: string
  locator: string
  agency_count: number
  corroborating_count: number
  party_kind: string
  recipient_resolvable: boolean
  confidence: number
  consecutive_runs: number
  runs_needed: number
  state: string
}

export interface RunCounts {
  run_date: string
  checked: number
  healthy: number
  failing: number
  suppressed_credential: number
  suppressed_catalog: number
  actionable: number
}

export interface Queue {
  run_date: string | null
  run: RunCounts | null
  cases: QueueCase[]
  suppressed: { reason: string; n: number }[]
  runs_on_file: string[]
}

export type Bucket =
  | 'checked'
  | 'healthy'
  | 'failing'
  | 'actionable'
  | 'suppressed_catalog'
  | 'suppressed_credential'

export interface LedgerRow {
  feed_id: string | null
  provider: string
  url: string
  status_class: string
  http_code: number | null
  content_type: string
  catalog_field: string | null
  catalog_value: string | null
  reason: string | null
  observed_at: string
}

export interface Ledger {
  bucket: Bucket
  title: string
  rows: LedgerRow[]
}

export interface Member {
  feed_id: string
  role: 'member' | 'corroborating'
  reason: string | null
}

export interface Evidence {
  kind: string
  observation: Record<string, unknown>
  source_url: string | null
  observed_at: string
}

export interface CaseDetail extends QueueCase {
  cause_key: string
  status_class: string
  first_seen: string
  last_seen: string
  members: Member[]
  evidence: Evidence[]
  attribution: { kind: string; observation: string; source_url: string | null }[]
  draft: { subject: string; body: string; recipient_kind: string; generated_at: string } | null
  decisions: { actor: string; action: string; at: string; note: string | null }[]
}

/** A failed read is surfaced by the route's catch, which renders the message. */
class ApiError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) {
    return await Promise.reject(new ApiError(`${path} returned ${String(res.status)}`))
  }
  return (await res.json()) as T
}

async function post<T>(path: string, payload: unknown = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return (await res.json()) as T
}

/** A tool call the harness has suspended. The gate is the harness's; this is the view of it. */
export interface PendingApproval {
  session_id: string
  session_title: string
  thread_id: string
  tool_call_id: string
  tool_name: string
  arguments: Record<string, unknown>
  case_id: string | null
  said: string
  requested_at: string
}

/** `harness: false` means the gate cannot be seen, which is not the same as nothing waiting. */
export interface Approvals {
  harness: boolean
  pending: PendingApproval[]
  /** False when the sweep was truncated, so an open gate may be missing from `pending`. */
  complete: boolean
  sessions_scanned: number
  sessions_total: number
  error?: string
}

export const api = {
  queue: async (): Promise<Queue> => await get<Queue>('/api/queue'),
  approvals: async (): Promise<Approvals> => await get<Approvals>('/api/approvals'),
  answer: async (
    gate: PendingApproval,
    status: 'allow' | 'deny',
    // The draft the steward actually read. The API refuses an approval if it has moved on.
    draftSeen: string | undefined,
    reason?: string,
  ): Promise<{ relayed?: string; error?: string }> =>
    await post('/api/approvals', {
      session_id: gate.session_id,
      thread_id: gate.thread_id,
      tool_call_id: gate.tool_call_id,
      status,
      draft_seen: draftSeen,
      reason,
    }),
  case: async (id: string): Promise<CaseDetail> => await get<CaseDetail>(`/api/cases/${id}`),
  ledger: async (bucket: Bucket, reason?: string): Promise<Ledger> => {
    const query = new URLSearchParams({ bucket })
    if (reason !== undefined) query.set('reason', reason)
    return await get<Ledger>(`/api/ledger?${query.toString()}`)
  },
  draft: async (id: string): Promise<unknown> => await post(`/api/cases/${id}/draft`),
  revise: async (id: string, subject: string, body: string): Promise<unknown> =>
    await post(`/api/cases/${id}/revise`, { subject, body }),
  decide: async (id: string, action: 'reject' | 'snooze', until?: string): Promise<unknown> =>
    await post(`/api/cases/${id}/decide`, { action, until }),
}
