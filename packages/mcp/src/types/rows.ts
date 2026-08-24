// Database rows come back as `unknown`. They are parsed here, once, so the rest of the
// server works with types rather than casts.
import { z } from 'zod'

import { CASE_STATES, CAUSE_KINDS, PARTY_KINDS } from '../constants/enums.js'

export const caseRowSchema = z.object({
  case_id: z.string(),
  cause_key: z.string(),
  cause_kind: z.enum(CAUSE_KINDS),
  status_class: z.string(),
  proposed_party: z.enum(PARTY_KINDS),
  party_kind: z.enum(PARTY_KINDS).nullable(),
  agency_count: z.number().int(),
  confidence: z.number().int().min(0).max(3),
  consecutive_runs: z.number().int(),
  state: z.enum(CASE_STATES),
  snoozed_until: z.string().nullable(),
  first_seen: z.string(),
  last_seen: z.string(),
})

export type CaseRow = z.infer<typeof caseRowSchema>

export const memberRowSchema = z.object({
  feed_id: z.string(),
  role: z.enum(['member', 'corroborating']),
  reason: z.string().nullable(),
})

export type MemberRow = z.infer<typeof memberRowSchema>
