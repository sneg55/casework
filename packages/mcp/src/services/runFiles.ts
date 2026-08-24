// The dated run files are canonical. Everything that needs a detection reads it from here,
// parsed once at the boundary, never with an ad-hoc JSON.parse in a tool.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Detection, detectionsSchema } from '../schemas/caseDocument.js'
import { env } from '../utils/env.js'

const RUN_FILE = /^\d{4}-\d{2}-\d{2}\.json$/

export function runDates(): string[] {
  try {
    return readdirSync(env.CASEWORK_RUN_DIR)
      .filter((name) => RUN_FILE.test(name))
      .map((name) => name.slice(0, -'.json'.length))
      .sort()
  } catch {
    return []
  }
}

export function latestRunDate(): string | undefined {
  return runDates().at(-1)
}

export function runPath(runDate: string): string {
  return join(env.CASEWORK_RUN_DIR, `${runDate}.json`)
}

export function readRun(runDate: string): Detection[] {
  return detectionsSchema.parse(JSON.parse(readFileSync(runPath(runDate), 'utf8')))
}

/** Detections for a set of feeds, in the order the caller asked for them. */
export function detectionsFor(runDate: string, feedIds: readonly string[]): Detection[] {
  const wanted = new Set(feedIds)
  return readRun(runDate).filter((d) => d.feed_id !== null && wanted.has(d.feed_id))
}
