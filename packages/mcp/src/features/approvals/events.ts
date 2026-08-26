// Reading a harness session's event stream for gates that are still open.
//
// A gate is open when a `tool.approval_required` names a tool call that no later `tool.response`
// has answered. The harness exposes no "pending" list, so this derives one.
import { readable } from '../../utils/prose.js'
import type { PendingApproval } from './types.js'

interface ToolCall {
  id: string
  source_event_id?: string
  function?: { name?: string; arguments?: string }
  tool_info?: { name?: string }
}

interface HarnessEvent {
  type: string
  id?: string
  created_at?: string
  thread_id?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
  content?: string
}

export interface EventRow {
  turn_id: string
  event: HarnessEvent
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined || raw === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    // A tool call whose arguments do not parse is still a gate worth showing.
    return {}
  }
}

function caseIdOf(args: Record<string, unknown>): string | null {
  const value = args['case_id']
  return typeof value === 'string' ? value : null
}

function index(rows: EventRow[]): {
  answered: Set<string>
  requested: Map<string, { call: ToolCall; said: string; at: string }>
} {
  const answered = new Set<string>()
  const requested = new Map<string, { call: ToolCall; said: string; at: string }>()
  for (const { event } of rows) {
    if (event.type === 'tool.response' && typeof event.tool_call_id === 'string') {
      answered.add(event.tool_call_id)
    }
    if (event.type === 'model.message' && event.tool_calls !== undefined) {
      for (const call of event.tool_calls) {
        requested.set(call.id, { call, said: event.content ?? '', at: event.created_at ?? '' })
      }
    }
  }
  return { answered, requested }
}

/** The approval event carries only ids, so the tool name and arguments come from the request. */
function describe(
  id: string,
  source: { call: ToolCall; said: string; at: string } | undefined,
  event: HarnessEvent,
  session: { id: string; title: string },
): PendingApproval {
  const args = parseArguments(source?.call.function?.arguments)
  return {
    session_id: session.id,
    session_title: session.title,
    thread_id: event.thread_id ?? 'main',
    tool_call_id: id,
    tool_name: source?.call.tool_info?.name ?? source?.call.function?.name ?? 'unknown',
    arguments: args,
    case_id: caseIdOf(args),
    said: readable(source?.said ?? ''),
    requested_at: source?.at ?? event.created_at ?? '',
  }
}

/**
 * The calls a human still owes an answer on, oldest first. `answered` spans the whole session,
 * so a gate released in an earlier turn does not reappear.
 */
export function openGates(
  rows: EventRow[],
  session: { id: string; title: string },
): PendingApproval[] {
  const { answered, requested } = index(rows)
  const gates: PendingApproval[] = []

  for (const { event } of rows) {
    if (event.type !== 'tool.approval_required' || event.tool_calls === undefined) continue
    for (const ref of event.tool_calls) {
      if (answered.has(ref.id)) continue
      gates.push(describe(ref.id, requested.get(ref.id), event, session))
    }
  }
  return gates
}
