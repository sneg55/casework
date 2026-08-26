// The read API's one outbound dependency: the TrueForge harness.
//
// This relays a human's answer to a gate the harness is already holding. It does not call
// outreach.send and it cannot. The harness owns the suspended call, so with no harness running
// there is nothing to approve, which is the property the gate is for.
import { AppError, ErrorIds } from '../../constants/errorIds.js'
import { type EventRow, openGates } from './events.js'
import type { Decision, PendingApproval, Scan } from './types.js'

// Per request, not per scan: one signal shared across a session list plus N event reads gives
// the whole sweep four seconds, so a merely slow harness reads as an absent one.
const TIMEOUT_MS = 4000
const SESSION_LIMIT = 25

interface Session {
  id: string
  title?: string
}

function headers(token: string | undefined): Record<string, string> {
  return token === undefined ? {} : { Authorization: `Bearer ${token}` }
}

async function get(origin: string, path: string, token: string | undefined): Promise<unknown> {
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: headers(token),
  })
  if (!response.ok) {
    throw new AppError(ErrorIds.NET_UNAVAILABLE, 'the harness did not answer', {
      path,
      status: response.status,
    })
  }
  return await response.json()
}

function dataOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (typeof payload === 'object' && payload !== null) {
    const { data } = payload as { data?: unknown }
    if (Array.isArray(data)) return data
  }
  return []
}

/**
 * Every gate the harness is holding, newest session first. The sweep is bounded, and `complete`
 * says whether it was: a truncated scan that reported a short list would read as "nothing is
 * waiting" for a gate that is still open.
 */
export async function pending(
  origin: string,
  token?: string,
  limit = SESSION_LIMIT,
): Promise<Scan> {
  const sessions = dataOf(await get(origin, '/api/v1/sessions', token)) as Session[]
  const looked = sessions.slice(0, limit)
  const gates: PendingApproval[] = []

  for (const session of looked) {
    const rows = dataOf(
      await get(origin, `/api/v1/sessions/${session.id}/events`, token),
    ) as EventRow[]
    gates.push(...openGates(rows, { id: session.id, title: session.title ?? '' }))
  }
  return {
    pending: gates,
    sessions_scanned: looked.length,
    sessions_total: sessions.length,
    complete: looked.length === sessions.length,
  }
}

/** Post the human's answer back as the turn input item the harness is waiting for. */
export async function relay(origin: string, decision: Decision, token?: string): Promise<void> {
  const approval =
    decision.status === 'allow'
      ? { status: 'allow' as const }
      : {
          status: 'deny' as const,
          ...(decision.reason === undefined ? {} : { reason: decision.reason }),
        }

  const response = await fetch(`${origin}/api/v1/sessions/${decision.session_id}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers(token) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      input: [
        {
          type: 'user.tool_approval',
          thread_id: decision.thread_id,
          tool_call_id: decision.tool_call_id,
          approval,
        },
      ],
    }),
  })
  if (!response.ok) {
    // The call stays suspended, which is the safe end of this failure.
    throw new AppError(ErrorIds.NET_UNAVAILABLE, 'the harness refused the decision', {
      status: response.status,
      session_id: decision.session_id,
    })
  }
}
