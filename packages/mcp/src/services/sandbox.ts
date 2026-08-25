// Everything that runs the probe. The server never fetches a feed itself: the sandbox
// script does, and returns a table. See docs/SPEC.md section 4 on why Code Mode is
// load-bearing rather than decoration.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  type CaseDocument,
  caseDocumentSchema,
  type Detection,
  detectionsSchema,
} from '../schemas/caseDocument.js'
import { env } from '../utils/env.js'

const run = promisify(execFile)

// A full jurisdiction is 256 range-limited fetches at 12 at a time.
const PROBE_TIMEOUT_MS = 300_000
// A handful of feeds during attribution, not a jurisdiction.
const REPROBE_TIMEOUT_MS = 60_000
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

async function probe(args: readonly string[]): Promise<CaseDocument> {
  const { stdout } = await run(env.CASEWORK_PYTHON, [env.CASEWORK_PROBE, ...args, '--json'], {
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
  })
  return caseDocumentSchema.parse(JSON.parse(stdout))
}

/** Probe live feeds and capture the run. Detections stay in the run file, not in a reply. */
export async function runProbe(options: {
  jurisdiction: string
  feedIds: readonly string[] | undefined
  capture: boolean
}): Promise<CaseDocument> {
  const args = ['--jurisdiction', options.jurisdiction, '--run-dir', env.CASEWORK_RUN_DIR]
  if (options.feedIds !== undefined && options.feedIds.length > 0) {
    args.push('--feed-ids', options.feedIds.join(','))
  }
  if (!options.capture) args.push('--no-capture')
  return await probe(args)
}

/** Rebuild cases from a captured run. Fetches nothing, so it is safe to repeat. */
export async function replayRun(runFile: string): Promise<CaseDocument> {
  return await probe(['--replay', runFile, '--run-dir', env.CASEWORK_RUN_DIR])
}

/**
 * Re-probe a handful of feeds during attribution and read the detections back. Never
 * captures: a bounded re-fetch is a second look at a case, and writing it to the run file
 * would put a partial jurisdiction where a whole one belongs and break the run counter.
 */
export async function reprobeFeeds(
  feedIds: readonly string[],
  jurisdiction = 'California',
): Promise<Detection[]> {
  if (feedIds.length === 0) return []
  const { stdout } = await run(
    env.CASEWORK_PYTHON,
    [
      env.CASEWORK_PROBE,
      '--jurisdiction',
      jurisdiction,
      '--feed-ids',
      feedIds.join(','),
      '--no-capture',
      '--detections',
    ],
    { timeout: REPROBE_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
  )
  return detectionsSchema.parse(JSON.parse(stdout))
}
