// catalog.load. The CSV is read in the sandbox and never crosses into a tool reply whole:
// without feed ids this is a summary, with them it is the rows asked for.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { z } from 'zod'

import { env } from '../../utils/env.js'
import { fromRoot } from '../../utils/repoRoot.js'

const run = promisify(execFile)
const CATALOG_TIMEOUT_MS = 90_000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const SCRIPT = fromRoot('scripts/catalog_query.py')

export const catalogRowSchema = z.object({
  feed_id: z.string().nullable(),
  provider: z.string(),
  url: z.string(),
  auth_type: z.string(),
  catalog_status: z.string(),
  redirect_id: z.string(),
  contact_on_file: z.boolean(),
})

export const catalogResultSchema = z.object({
  jurisdiction: z.string(),
  summary: z.object({
    feeds: z.number().int(),
    by_status: z.record(z.string(), z.number()),
    by_auth_type: z.record(z.string(), z.number()),
    with_redirect: z.number().int(),
    with_contact_on_file: z.number().int(),
    top_hosts: z.array(z.tuple([z.string(), z.number()])),
  }),
  rows: z.array(catalogRowSchema).optional(),
})

export type CatalogResult = z.infer<typeof catalogResultSchema>

export async function queryCatalog(
  jurisdiction: string,
  feedIds?: readonly string[],
): Promise<CatalogResult> {
  const args = [SCRIPT, '--jurisdiction', jurisdiction]
  if (feedIds && feedIds.length > 0) args.push('--feed-ids', feedIds.join(','))
  const { stdout } = await run(env.CASEWORK_PYTHON, args, {
    timeout: CATALOG_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
  })
  return catalogResultSchema.parse(JSON.parse(stdout))
}
