// Grouping says these failed together. This says whose problem it is, and records what it
// read. Confidence is counted, never estimated: the three points are defined in section 6
// of the spec and each one is a fact this function checked.
import { MAX_CONFIDENCE, PARTY_FOR_CAUSE, type PartyKind } from '../../constants/enums.js'
import { detectionsFor, latestRunDate } from '../../services/runFiles.js'
import type { Store } from '../../services/store.js'
import { type CaseView, caseView } from '../cases/view.js'
import { resolveRedirect } from './redirectResolve.js'
import { inspectRepo, splitRawPath } from './repoInspect.js'
import { inspectCertificate } from './tlsInspect.js'

export interface Attribution {
  case_id: string
  cause_kind: string
  party_kind: PartyKind
  confidence: number
  points: string[]
  evidence_written: number
  finding: string
}

/** Enough siblings to show the pattern; the rest are the same fact repeated. */
const SAMPLE_SIBLINGS = 3

interface EvidenceRow {
  kind: 'repo' | 'tls' | 'redirect'
  observation: unknown
  source_url: string | null
}

async function investigateRepo(
  detections: readonly { path: string }[],
): Promise<{ rows: EvidenceRow[]; finding: string }> {
  const first = detections[0]
  const { owner, repo } = splitRawPath(first?.path ?? '')
  if (owner === undefined || repo === undefined) {
    return { rows: [], finding: 'the cause key does not name a repository' }
  }
  const dirs = detections.map((d) => splitRawPath(d.path).dir).filter((d) => d !== undefined)
  const facts = await inspectRepo(owner, repo, dirs)
  const finding = !facts.exists
    ? `${owner}/${repo} does not exist or is not public`
    : facts.archived
      ? `${owner}/${repo} is archived, so nobody is maintaining the paths`
      : `${owner}/${repo} is alive, pushed ${facts.pushed_at ?? 'unknown'}, and ${facts.paths_missing.length} of the ${dirs.length} directories the catalog references are gone`
  return { rows: [{ kind: 'repo', observation: facts, source_url: facts.html_url }], finding }
}

async function investigateTls(host: string): Promise<{ rows: EvidenceRow[]; finding: string }> {
  const facts = await inspectCertificate(host)
  const finding = facts.reachable
    ? `certificate for ${facts.subject ?? host} issued by ${facts.issuer ?? 'unknown'} expires ${facts.valid_to ?? 'unknown'}`
    : `${host} did not complete a handshake`
  return { rows: [{ kind: 'tls', observation: facts, source_url: `https://${host}` }], finding }
}

async function investigateRetired(
  view: CaseView,
): Promise<{ rows: EvidenceRow[]; finding: string }> {
  const siblings = view.members.filter((m) => m.role === 'corroborating').slice(0, SAMPLE_SIBLINGS)
  const rows: EvidenceRow[] = []
  let healthy = 0
  for (const sibling of siblings) {
    const facts = await resolveRedirect(sibling.feed_id)
    if (facts.replacement_healthy === true) healthy += 1
    rows.push({ kind: 'redirect', observation: facts, source_url: facts.replacement_url })
  }
  return {
    rows,
    finding: `${healthy} of ${siblings.length} sampled siblings already point at a replacement that serves, and ${view.agency_count} entry or entries on this host still do not`,
  }
}

async function investigate(
  store: Store,
  caseId: string,
  runDate: string,
): Promise<{ rows: EvidenceRow[]; finding: string }> {
  const view = caseView(store, caseId, runDate)
  if (view === undefined) return { rows: [], finding: 'no such case' }
  const memberIds = view.members.filter((m) => m.role === 'member').map((m) => m.feed_id)

  switch (view.cause_kind) {
    case 'code_host_path_removed':
      return await investigateRepo(detectionsFor(runDate, memberIds))
    case 'tls_expired':
      return await investigateTls(view.locator.split('/')[0] ?? view.locator)
    case 'deprecated_service':
      return await investigateRetired(view)
    default:
      return { rows: [], finding: 'no external investigation for this cause kind' }
  }
}

/** One case, one subagent's worth of work, written once. */
export async function attributeCase(
  store: Store,
  caseId: string,
  runDate?: string,
): Promise<Attribution | undefined> {
  const date = runDate ?? latestRunDate()
  const view = caseView(store, caseId, date)
  if (view === undefined || date === undefined) return undefined

  const { rows, finding } = await investigate(store, caseId, date)
  const insert = store.db.prepare(
    'INSERT INTO evidence (case_id, kind, observation, source_url, observed_at) VALUES (?, ?, ?, ?, ?)',
  )
  const observedAt = new Date().toISOString()
  store.db.prepare('DELETE FROM evidence WHERE case_id = ?').run(caseId)
  for (const row of rows) {
    insert.run(caseId, row.kind, JSON.stringify(row.observation), row.source_url, observedAt)
  }

  const points: string[] = []
  if (view.cause_kind !== 'host_unreachable' && view.cause_kind !== 'individual') {
    points.push('cause kind resolved to something more specific than the fallback')
  }
  if (view.agency_count > 1 || view.corroborating_count > 0) {
    points.push('the group is more than one feed, or is corroborated by retired siblings')
  }
  if (rows.length > 0) {
    points.push('an external check returned evidence naming the party')
  }

  const party = PARTY_FOR_CAUSE[view.cause_kind as keyof typeof PARTY_FOR_CAUSE]
  const confidence = Math.min(points.length, MAX_CONFIDENCE)
  store.db
    .prepare('UPDATE cases SET party_kind = ?, confidence = ? WHERE case_id = ?')
    .run(party, confidence, caseId)

  return {
    case_id: caseId,
    cause_kind: view.cause_kind,
    party_kind: party,
    confidence,
    points,
    evidence_written: rows.length,
    finding,
  }
}
