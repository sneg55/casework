// redirect.resolve. A retired catalog entry names its replacement; this checks that the
// replacement is actually serving, which is what turns "the catalog already handled it"
// from an assumption into an observation.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { type Detection, detectionsSchema } from '../../schemas/caseDocument.js'
import { env } from '../../utils/env.js'
import { queryCatalog } from '../catalog/catalogQuery.js'

const run = promisify(execFile)
const PROBE_TIMEOUT_MS = 60_000

export interface RedirectFacts {
  from_feed_id: string
  to_feed_id: string | null
  replacement_url: string | null
  replacement_status_class: string | null
  replacement_healthy: boolean | null
  note: string
}

async function probeOne(jurisdiction: string, feedId: string): Promise<Detection | undefined> {
  const { stdout } = await run(
    env.CASEWORK_PYTHON,
    [
      env.CASEWORK_PROBE,
      '--jurisdiction',
      jurisdiction,
      '--feed-ids',
      feedId,
      '--no-capture',
      '--detections',
    ],
    { timeout: PROBE_TIMEOUT_MS },
  )
  return detectionsSchema.parse(JSON.parse(stdout))[0]
}

export async function resolveRedirect(
  feedId: string,
  jurisdiction = 'California',
): Promise<RedirectFacts> {
  const source = await queryCatalog(jurisdiction, [feedId])
  const row = source.rows?.[0]
  if (row === undefined) {
    return {
      from_feed_id: feedId,
      to_feed_id: null,
      replacement_url: null,
      replacement_status_class: null,
      replacement_healthy: null,
      note: 'no catalog entry for this feed in this jurisdiction',
    }
  }
  if (row.redirect_id === '') {
    return {
      from_feed_id: feedId,
      to_feed_id: null,
      replacement_url: null,
      replacement_status_class: null,
      replacement_healthy: null,
      note:
        row.catalog_status === 'deprecated' || row.catalog_status === 'inactive'
          ? 'retired with no replacement recorded, which is a gap in the catalog itself'
          : 'no redirect recorded for this entry',
    }
  }

  const detection = await probeOne(jurisdiction, row.redirect_id)
  if (detection === undefined) {
    // The replacement is outside this jurisdiction's slice, so it was not probed.
    return {
      from_feed_id: feedId,
      to_feed_id: row.redirect_id,
      replacement_url: null,
      replacement_status_class: null,
      replacement_healthy: null,
      note: 'replacement is outside the probed jurisdiction',
    }
  }
  return {
    from_feed_id: feedId,
    to_feed_id: row.redirect_id,
    replacement_url: detection.url,
    replacement_status_class: detection.status_class,
    replacement_healthy: detection.healthy,
    note: detection.healthy
      ? 'replacement is serving, so this entry needs no outreach'
      : 'replacement is not serving either',
  }
}
