// Tool registration. Every tool here is read-only or writes to our own store; the one tool
// that leaves the building, outreach.send, is not here yet and arrives behind the approval
// gate. Names match docs/SPEC.md section 5.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CASE_STATES } from './constants/enums.js'
import { caseView, queueRow } from './features/cases/view.js'
import { queryCatalog } from './features/catalog/catalogQuery.js'
import { isResolvable, loadRegistry } from './features/recipients/registry.js'
import { latestRunDate, runPath } from './services/runFiles.js'
import { replayRun, runProbe } from './services/sandbox.js'
import type { Store } from './services/store.js'

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const

function reply(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 1) }] }
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

export function createServer(store: Store): McpServer {
  const server = new McpServer({ name: 'casework-mcp', version: '0.1.0' })

  server.registerTool(
    'catalog.load',
    {
      title: 'Load the feed catalog',
      description:
        'What the public Mobility Database says about a jurisdiction: counts by status and ' +
        'authentication type, redirects, and whether a contact is on file. Never an address. ' +
        'Pass feed_ids for individual rows; without them this is a summary, because the CSV ' +
        'is 1.12 MB and belongs in the sandbox.',
      inputSchema: {
        jurisdiction: z.string().default('California'),
        feed_ids: z.array(z.string()).optional(),
      },
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ jurisdiction, feed_ids }) => reply(await queryCatalog(jurisdiction, feed_ids)),
  )

  server.registerTool(
    'probe.run',
    {
      title: 'Probe the feeds',
      description:
        'Fetch every feed in the jurisdiction in the sandbox and capture the run to ' +
        'data/runs/<date>.json. Returns the case document, never the payloads.',
      inputSchema: {
        jurisdiction: z.string().default('California'),
        feed_ids: z.array(z.string()).optional(),
        capture: z.boolean().default(true),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ jurisdiction, feed_ids, capture }) =>
      reply(await runProbe({ jurisdiction, feedIds: feed_ids, capture })),
  )

  server.registerTool(
    'cases.build',
    {
      title: 'Build the cases for a run',
      description:
        'Triage, grouping, cause resolution and run counts for a captured run, then persist ' +
        'them. Fetches nothing and is idempotent per run date: case_id is derived from the ' +
        'cause key, so rebuilding updates rows rather than duplicating them.',
      inputSchema: { run_date: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ run_date }) => {
      const date = run_date ?? latestRunDate()
      if (date === undefined) return fail('No captured run. Run probe.run first.')
      const doc = await replayRun(runPath(date))
      const built = store.persistRun(doc, new Date().toISOString())
      return reply({ run_date: doc.run_date, counts: doc.counts, cases_persisted: built })
    },
  )

  server.registerTool(
    'cases.list',
    {
      title: 'The queue',
      description:
        'Cases ranked by agency count. One row is one cause, never a feed. Suppressed feeds ' +
        'are not rows here; they are reported by their case as corroboration.',
      inputSchema: { state: z.enum(CASE_STATES).optional() },
      annotations: READ_ONLY,
    },
    ({ state }) => {
      const date = latestRunDate()
      if (date === undefined) return fail('No captured run. Run probe.run first.')
      return reply({
        run_date: date,
        cases: store.listCases(state).map((row) => queueRow(store, row, date)),
      })
    },
  )

  server.registerTool(
    'evidence.get',
    {
      title: 'Everything backing a case',
      description:
        'The case with its members, its corroborating siblings and every observation behind ' +
        'them, with timestamps. Contact addresses are never included.',
      inputSchema: { case_id: z.string(), run_date: z.string().optional() },
      annotations: READ_ONLY,
    },
    ({ case_id, run_date }) => {
      const view = caseView(store, case_id, run_date)
      return view === undefined ? fail(`No such case: ${case_id}`) : reply(view)
    },
  )

  server.registerTool(
    'recipient.lookup',
    {
      title: 'Is there a channel for this case',
      description:
        'The kind of party a case is addressed to and whether a channel exists for it. ' +
        'Returns no address, ever. Addresses are read inside outreach.send at send time.',
      inputSchema: { case_id: z.string() },
      annotations: READ_ONLY,
    },
    ({ case_id }) => {
      const view = caseView(store, case_id)
      if (view === undefined) return fail(`No such case: ${case_id}`)
      return reply({
        case_id,
        party_kind: view.party_kind,
        resolvable: view.recipient_resolvable,
      })
    },
  )

  return server
}

export { isResolvable, loadRegistry }
