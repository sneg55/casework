// The boundary between the sandbox and the server. Everything the probe emits is parsed
// here and nowhere else, so a change to the Python side fails loudly at one point rather
// than spreading `any` through the tools.
import { z } from 'zod'

import { CAUSE_KINDS, PARTY_KINDS } from '../constants/enums.js'

export const corroboratingSchema = z.object({
  feed_id: z.string(),
  reason: z.string(),
})

export const caseRecordSchema = z.object({
  case_id: z.string().regex(/^[0-9a-f]{12}$/),
  cause_key: z.string().min(1),
  cause_kind: z.enum(CAUSE_KINDS),
  status_class: z.string().min(1),
  proposed_party: z.enum(PARTY_KINDS),
  agency_count: z.number().int().nonnegative(),
  member_feed_ids: z.array(z.string()),
  corroborating: z.array(corroboratingSchema),
  consecutive_runs: z.number().int().positive(),
})

export const suppressionSchema = z.object({
  feed_id: z.string(),
  cause_key: z.string(),
  reason: z.string(),
})

export const caseDocumentSchema = z.object({
  run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prior_runs_on_file: z.number().int().nonnegative(),
  counts: z.object({
    checked: z.number().int().nonnegative(),
    healthy: z.number().int().nonnegative(),
    failing: z.number().int().nonnegative(),
    suppressed_by_credential: z.number().int().nonnegative(),
    suppressed_by_catalog: z.number().int().nonnegative(),
    actionable: z.number().int().nonnegative(),
  }),
  cases: z.array(caseRecordSchema),
  individual: z.array(caseRecordSchema),
  suppressed: z.array(suppressionSchema),
})

export type CaseRecord = z.infer<typeof caseRecordSchema>
export type Suppression = z.infer<typeof suppressionSchema>
export type CaseDocument = z.infer<typeof caseDocumentSchema>

/** Detection fields the server reads. The run file holds more; nothing here is a contact. */
export const detectionSchema = z.object({
  run_date: z.string(),
  observed_at: z.string(),
  feed_id: z.string().nullable(),
  provider: z.string(),
  url: z.string(),
  host: z.string(),
  path: z.string(),
  status_class: z.string(),
  healthy: z.boolean(),
  http_code: z.number().nullable(),
  content_type: z.string(),
  magic_ok: z.boolean(),
  // Optional because the runs captured before it existed are evidence and are never
  // regenerated to match a later schema.
  body_prefix: z.string().optional(),
  tls_ok: z.boolean().nullable(),
  latency_ms: z.number(),
  attempts: z.number(),
  auth_type: z.string(),
  catalog_status: z.string(),
  redirect_id: z.string(),
  contact_on_file: z.boolean(),
})

export type Detection = z.infer<typeof detectionSchema>
export const detectionsSchema = z.array(detectionSchema)
