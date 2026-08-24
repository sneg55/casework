// The message. Facts are assembled here, deterministically, from the case and its evidence,
// because a request to an outside organization about their infrastructure has to be exactly
// right about what was observed. The agent may rewrite the wording through outreach.revise;
// it cannot invent an observation, because the observations come from this function.
import { z } from 'zod'

import { detectionsFor, latestRunDate } from '../../services/runFiles.js'
import type { Store } from '../../services/store.js'
import { type CaseView, caseView } from '../cases/view.js'

export interface Draft {
  case_id: string
  subject: string
  body: string
  recipient_kind: string
  generated_at: string
}

const repoObservation = z.object({
  owner: z.string(),
  repo: z.string(),
  archived: z.boolean(),
  pushed_at: z.string().nullable(),
  paths_missing: z.array(z.string()),
  paths_present: z.array(z.string()),
  html_url: z.string().nullable(),
})

function evidenceOf(store: Store, caseId: string, kind: string): unknown[] {
  return store.db
    .prepare<[string, string], { observation: string }>(
      'SELECT observation FROM evidence WHERE case_id = ? AND kind = ?',
    )
    .all(caseId, kind)
    .map((row): unknown => JSON.parse(row.observation))
}

function observedLines(store: Store, view: CaseView, runDate: string): string[] {
  const members = view.members.filter((m) => m.role === 'member').map((m) => m.feed_id)
  return detectionsFor(runDate, members).map(
    (d) =>
      `  ${d.provider}: ${d.url} returned ${d.http_code ?? 'no response'}` +
      `${d.content_type === '' ? '' : ` (${d.content_type})`}, observed ${d.observed_at}`,
  )
}

function repositoryBody(store: Store, view: CaseView, observed: string[]): string {
  const [first] = evidenceOf(store, view.case_id, 'repo')
  const facts = repoObservation.safeParse(first)
  const detail = facts.success
    ? `The repository is ${facts.data.archived ? 'archived' : 'active'} and was last pushed ` +
      `${facts.data.pushed_at ?? 'at an unknown time'}. The directories the catalog references ` +
      `are not present: ${facts.data.paths_missing.join(', ')}. Present today: ` +
      `${facts.data.paths_present.join(', ')}.`
    : 'The repository was not inspected.'
  return [
    `The public feed catalog points ${view.agency_count} agency feeds at paths inside your`,
    `repository, and all of them return 404 today.`,
    '',
    detail,
    '',
    'Observed:',
    ...observed,
    '',
    'Two questions, and either answer closes this:',
    '  1. Did those directories move, and if so where to?',
    '  2. Or should the catalog stop pointing at this repository for them?',
    '',
    'Nobody is asking you to host anything you have stopped hosting. The catalog entries',
    'are what need correcting, and we would rather correct them than leave the agencies dark.',
  ].join('\n')
}

function hostBody(view: CaseView, observed: string[]): string {
  return [
    `${view.agency_count} feed URLs on ${view.locator} end in .zip and return HTML rather than`,
    'a zip archive. A status check passes; a content check does not, so anything consuming',
    'these feeds sees a successful response carrying the wrong body.',
    '',
    'Observed:',
    ...observed,
    '',
    'Is this a routing or export problem on the platform, or should these URLs be retired?',
  ].join('\n')
}

function catalogBody(view: CaseView, observed: string[]): string {
  return [
    `${view.locator} is retired. Most of its entries in the catalog are already marked`,
    'deprecated with a replacement recorded, which is the correct outcome and is why this is',
    `not addressed to any agency. ${view.agency_count} entry or entries still point at it with`,
    'no replacement recorded.',
    '',
    'Observed:',
    ...observed,
    '',
    'Could those entries be re-pointed or retired the same way as their siblings?',
  ].join('\n')
}

const BODY_BY_PARTY: Record<string, (store: Store, view: CaseView, observed: string[]) => string> =
  {
    repository: (store, view, observed) => repositoryBody(store, view, observed),
    host_operator: (_store, view, observed) => hostBody(view, observed),
    catalog: (_store, view, observed) => catalogBody(view, observed),
  }

function genericBody(view: CaseView, observed: string[]): string {
  return [
    `${view.agency_count} feed URLs under ${view.locator} are failing with ${view.status_class}.`,
    '',
    'Observed:',
    ...observed,
    '',
    'Is this expected, and is there a URL the catalog should use instead?',
  ].join('\n')
}

export function draftFor(store: Store, caseId: string, runDate?: string): Draft | undefined {
  const date = runDate ?? latestRunDate()
  const view = caseView(store, caseId, date)
  if (view === undefined || date === undefined) return undefined

  const observed = observedLines(store, view, date)
  const build = BODY_BY_PARTY[view.party_kind]
  const body = build ? build(store, view, observed) : genericBody(view, observed)
  const subject =
    view.party_kind === 'repository'
      ? `GTFS paths referenced by the public feed catalog are returning 404`
      : view.party_kind === 'catalog'
        ? `Catalog entries still pointing at ${view.locator}`
        : `${view.agency_count} GTFS feeds on ${view.locator} are not serving a zip archive`

  const draft: Draft = {
    case_id: caseId,
    subject,
    body,
    recipient_kind: view.party_kind,
    generated_at: new Date().toISOString(),
  }
  store.db
    .prepare(
      'INSERT INTO drafts (case_id, subject, body, recipient_kind, generated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(caseId, draft.subject, draft.body, draft.recipient_kind, draft.generated_at)
  return draft
}

/** An edit is a new draft, not an overwrite: section 6 keeps the previous one. */
export function reviseDraft(store: Store, caseId: string, subject: string, body: string): Draft {
  const generated_at = new Date().toISOString()
  const recipient_kind = store.getCase(caseId)?.party_kind ?? 'unattributed'
  store.db
    .prepare(
      'INSERT INTO drafts (case_id, subject, body, recipient_kind, generated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(caseId, subject, body, recipient_kind, generated_at)
  return { case_id: caseId, subject, body, recipient_kind, generated_at }
}

export function latestDraft(store: Store, caseId: string): Draft | undefined {
  const row = store.db
    .prepare<[string], unknown>(
      'SELECT case_id, subject, body, recipient_kind, generated_at FROM drafts WHERE case_id = ? ORDER BY generated_at DESC LIMIT 1',
    )
    .get(caseId)
  return row === undefined
    ? undefined
    : z
        .object({
          case_id: z.string(),
          subject: z.string(),
          body: z.string(),
          recipient_kind: z.string(),
          generated_at: z.string(),
        })
        .parse(row)
}
