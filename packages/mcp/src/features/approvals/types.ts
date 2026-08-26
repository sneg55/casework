// What the screens need to show a gate that is open, and what it takes to answer it.

/** One tool call the harness has suspended and is waiting on a human for. */
export interface PendingApproval {
  session_id: string
  session_title: string
  thread_id: string
  tool_call_id: string
  /** The MCP name, `outreach.send`, not the wire name `outreach_send`. */
  tool_name: string
  /** Parsed tool arguments. `case_id` is the one the case route matches on. */
  arguments: Record<string, unknown>
  case_id: string | null
  /** What the agent said in the same message it requested the call. */
  said: string
  requested_at: string
}

/** A bounded sweep of the harness. `complete` false means the list may be missing a gate. */
export interface Scan {
  pending: PendingApproval[]
  sessions_scanned: number
  sessions_total: number
  complete: boolean
}

export interface Decision {
  session_id: string
  thread_id: string
  tool_call_id: string
  status: 'allow' | 'deny'
  reason?: string
}
