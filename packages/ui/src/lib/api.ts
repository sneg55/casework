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

export const api = {
  queue: async (): Promise<Queue> => await get<Queue>('/api/queue'),
  case: async (id: string): Promise<CaseDetail> => await get<CaseDetail>(`/api/cases/${id}`),
  draft: async (id: string): Promise<unknown> => await post(`/api/cases/${id}/draft`),
  revise: async (id: string, subject: string, body: string): Promise<unknown> =>
    await post(`/api/cases/${id}/revise`, { subject, body }),
  decide: async (id: string, action: 'reject' | 'snooze', until?: string): Promise<unknown> =>
    await post(`/api/cases/${id}/decide`, { action, until }),
}
