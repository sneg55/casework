// Deriving open gates from a harness event stream. The rule that matters: a call the harness
// has already answered is not still waiting, however many approval events precede it.
import { describe, expect, it } from 'vitest'

import { type EventRow, openGates } from '../src/features/approvals/events.js'

const SESSION = { id: 'sess-1', title: 'Case CW-0005 is ready' }

function requested(id: string, name = 'outreach.send', caseId = '83d87fefd630'): EventRow {
  return {
    turn_id: 'turn-1',
    event: {
      type: 'model.message',
      id: 'ev-req',
      created_at: '2026-08-26T11:22:59.776Z',
      content: 'Now sending it.',
      tool_calls: [
        {
          id,
          function: {
            name: name.replace('.', '_'),
            arguments: JSON.stringify({ case_id: caseId }),
          },
          tool_info: { name },
        },
      ],
    },
  }
}

function gated(id: string): EventRow {
  return {
    turn_id: 'turn-1',
    event: {
      type: 'tool.approval_required',
      id: 'ev-gate',
      created_at: '2026-08-26T11:23:00.000Z',
      thread_id: 'main',
      tool_calls: [{ id, source_event_id: 'ev-req' }],
    },
  }
}

function answered(id: string): EventRow {
  return {
    turn_id: 'turn-1',
    event: { type: 'tool.response', id: 'ev-resp', tool_call_id: id, thread_id: 'main' },
  }
}

describe('openGates', () => {
  it('reports a suspended call with the tool, the case and what the agent said', () => {
    const gates = openGates([requested('call-1'), gated('call-1')], SESSION)
    expect(gates).toHaveLength(1)
    expect(gates[0]).toMatchObject({
      session_id: 'sess-1',
      thread_id: 'main',
      tool_call_id: 'call-1',
      tool_name: 'outreach.send',
      case_id: '83d87fefd630',
      said: 'Now sending it.',
    })
  })

  it('reports nothing once the harness has answered the call', () => {
    const rows = [requested('call-1'), gated('call-1'), answered('call-1')]
    expect(openGates(rows, SESSION)).toEqual([])
  })

  it('answers a gate from an earlier turn without reopening it', () => {
    // The response arrives before a second gate in the same stream. Order must not matter:
    // `answered` is collected across the whole session before any gate is judged.
    const rows = [
      requested('call-1'),
      gated('call-1'),
      answered('call-1'),
      requested('call-2'),
      gated('call-2'),
    ]
    const gates = openGates(rows, SESSION)
    expect(gates.map((g) => g.tool_call_id)).toEqual(['call-2'])
  })

  it('still reports a gate whose arguments did not parse', () => {
    const broken: EventRow = {
      turn_id: 'turn-1',
      event: {
        type: 'model.message',
        id: 'ev-req',
        tool_calls: [{ id: 'call-1', function: { name: 'outreach_send', arguments: '{not json' } }],
      },
    }
    const gates = openGates([broken, gated('call-1')], SESSION)
    expect(gates).toHaveLength(1)
    expect(gates[0]?.case_id).toBeNull()
    expect(gates[0]?.tool_name).toBe('outreach_send')
  })

  it('reports a gate whose requesting message is missing rather than dropping it', () => {
    // A gate the UI cannot describe is still a gate a human has to answer.
    const gates = openGates([gated('call-9')], SESSION)
    expect(gates).toHaveLength(1)
    expect(gates[0]?.tool_name).toBe('unknown')
  })
})
