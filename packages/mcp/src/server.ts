// Tool registration. Every tool here is read-only or writes to our own store; the one tool
// that leaves the building, outreach.send, is not here yet and arrives behind the approval
// gate. Names match docs/SPEC.md section 5.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CASE_STATES } from './constants/enums.js'
import { attributeCase } from './features/attribution/attribute.js'
import { resolveRedirect } from './features/attribution/redirectResolve.js'
import { inspectRepo } from './features/attribution/repoInspect.js'
import { inspectCertificate } from './features/attribution/tlsInspect.js'
import { caseView, queueRow } from './features/cases/view.js'
import { queryCatalog } from './features/catalog/catalogQuery.js'
import { draftFor, latestDraft, reviseDraft } from './features/outreach/draft.js'
import { decide, sendCase } from './features/outreach/send.js'
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

  server.registerTool(
    'repo.inspect',
    {
      title: 'Read a code host repository',
      description:
        'Does the repository exist, is it public, is it archived, when was it pushed, and ' +
        'which of the directories the catalog references are present today.',
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
        expected_paths: z.array(z.string()).default([]),
      },
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ owner, repo, expected_paths }) =>
      reply(await inspectRepo(owner, repo, expected_paths)),
  )

  server.registerTool(
    'tls.inspect',
    {
      title: 'Read a certificate',
      description:
        'Subject, issuer and expiry for a host, so a TLS failure can be attributed to the ' +
        'certificate holder rather than to the agency whose feed it is.',
      inputSchema: { host: z.string() },
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ host }) => reply(await inspectCertificate(host)),
  )

  server.registerTool(
    'redirect.resolve',
    {
      title: 'Follow a catalog redirect',
      description:
        'Follows a retired entry to the replacement the catalog names and probes it, so ' +
        '"the catalog already handled this" is an observation rather than an assumption.',
      inputSchema: { feed_id: z.string(), jurisdiction: z.string().default('California') },
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ feed_id, jurisdiction }) => reply(await resolveRedirect(feed_id, jurisdiction)),
  )

  server.registerTool(
    'cases.attribute',
    {
      title: 'Attribute one case',
      description:
        'Runs the investigation for this cause kind, writes what it read as evidence, and ' +
        'records the party and a counted confidence from 0 to 3. A case it cannot attribute ' +
        'stays unattributed rather than guessing a recipient.',
      inputSchema: { case_id: z.string(), run_date: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ case_id, run_date }) => {
      const result = await attributeCase(store, case_id, run_date)
      return result === undefined ? fail(`No such case: ${case_id}`) : reply(result)
    },
  )

  server.registerTool(
    'outreach.draft',
    {
      title: 'Draft the message',
      description:
        'Composes the message for a case from its evidence: what the catalog asks for, what ' +
        'is actually there, and the question that closes it. Not gated, and it sends nothing.',
      inputSchema: { case_id: z.string(), run_date: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ case_id, run_date }) => {
      const draft = draftFor(store, case_id, run_date)
      return draft === undefined ? fail(`No such case: ${case_id}`) : reply(draft)
    },
  )

  server.registerTool(
    'outreach.revise',
    {
      title: 'Rewrite a draft',
      description:
        'Stores an edited subject and body as a new draft. The previous one is kept, and the ' +
        'latest is what outreach.send reads. Facts belong to the evidence, not to the wording.',
      inputSchema: { case_id: z.string(), subject: z.string(), body: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ case_id, subject, body }) => reply(reviseDraft(store, case_id, subject, body)),
  )

  server.registerTool(
    'outreach.review',
    {
      title: 'Read the current draft',
      description: 'The latest draft for a case, with no side effects.',
      inputSchema: { case_id: z.string() },
      annotations: READ_ONLY,
    },
    ({ case_id }) => {
      const draft = latestDraft(store, case_id)
      return draft === undefined ? fail(`No draft for ${case_id}`) : reply(draft)
    },
  )

  server.registerTool(
    'outreach.decide',
    {
      title: 'Reject or snooze a case',
      description:
        'Records a human decision that is not an approval. Rejecting closes the case; ' +
        'snoozing defers it to a date, after which it returns to the queue as ready.',
      inputSchema: {
        case_id: z.string(),
        action: z.enum(['reject', 'snooze']),
        actor: z.string().default('analyst'),
        note: z.string().optional(),
        until: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ case_id, action, actor, note, until }) =>
      reply(decide(store, { caseId: case_id, action, actor, note, until })),
  )

  server.registerTool(
    'outreach.send',
    {
      title: 'Send the message',
      description:
        'THE GATED TOOL. Renders the approved message to a real recipient and records the ' +
        'decision. Refuses unless the case is past the 3-day rule, attributed, drafted, not ' +
        'already acted on, and has a channel on file. No transport is configured for the ' +
        'demo, so the message is written to data/outbox and nothing leaves the machine.',
      inputSchema: { case_id: z.string(), actor: z.string().default('analyst') },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    ({ case_id, actor }) => reply(sendCase(store, case_id, actor)),
  )

  return server
}

export { isResolvable, loadRegistry }
