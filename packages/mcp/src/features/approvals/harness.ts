// The read API's one outbound dependency: the TrueForge harness.
//
// This relays a human's answer to a gate the harness is already holding. It does not call
// outreach.send and it cannot. The harness owns the suspended call, so with no harness running
// there is nothing to approve, which is the property the gate is for.
import { AppError, ErrorIds } from '../../constants/errorIds.js'
import { type EventRow, openGates } from './events.js'
import type { Decision, PendingApproval } from './types.js'

const TIMEOUT_MS = 4000

interface Session {
  id: string
  title?: string
}

async function get(origin: string, path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${origin}${path}`, { signal })
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
 * Every gate the harness is holding, across sessions, newest session first. `sessions` is
 * bounded because the harness returns them newest first and a gate lives in a running turn.
 */
export async function pending(origin: string, limit = 10): Promise<PendingApproval[]> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const sessions = dataOf(await get(origin, '/api/v1/sessions', signal)) as Session[]
  const gates: PendingApproval[] = []

  for (const session of sessions.slice(0, limit)) {
    const rows = dataOf(
      await get(origin, `/api/v1/sessions/${session.id}/events`, signal),
    ) as EventRow[]
    gates.push(...openGates(rows, { id: session.id, title: session.title ?? '' }))
  }
  return gates
}

/** Post the human's answer back as the turn input item the harness is waiting for. */
export async function relay(origin: string, decision: Decision): Promise<void> {
  const approval =
    decision.status === 'allow'
      ? { status: 'allow' as const }
      : {
          status: 'deny' as const,
          ...(decision.reason === undefined ? {} : { reason: decision.reason }),
        }

  const response = await fetch(`${origin}/api/v1/sessions/${decision.session_id}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
