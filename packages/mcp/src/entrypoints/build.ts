#!/usr/bin/env node
// Build the cases for a captured run without going through an agent, so the queue can be
// prepared from a shell: npm run build:cases -w @casework/mcp [-- 2026-08-24]
import { latestRunDate, runPath } from '../services/runFiles.js'
import { replayRun } from '../services/sandbox.js'
import { openStore } from '../services/store.js'
import { env } from '../utils/env.js'

const runDate = process.argv[2] ?? latestRunDate()
if (runDate === undefined) {
  process.stderr.write(`No captured run under ${env.CASEWORK_RUN_DIR}\n`)
  process.exit(1)
}

const store = openStore(env.CASEWORK_DB)
const doc = await replayRun(runPath(runDate))
const built = store.persistRun(doc, new Date().toISOString())
store.close()
process.stdout.write(
  `built ${String(built)} causes from ${runDate}: ` +
    `${String(doc.counts.actionable)} actionable of ${String(doc.counts.failing)} failing\n`,
)
