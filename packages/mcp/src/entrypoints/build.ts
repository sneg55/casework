#!/usr/bin/env node
// Build the cases for the captured runs without going through an agent, so the queue can be
// prepared from a shell: npm run build:cases -w @casework/mcp [-- 2026-08-24]
//
// With no argument it replays every run on file, oldest first. A case carries `first_seen`
// and it is written once, so replaying only the newest run would date every cause today and
// renumber the dockets. The store is idempotent per date, so repeating this is free.
import { runDates, runPath } from '../services/runFiles.js'
import { replayRun } from '../services/sandbox.js'
import { openStore } from '../services/store.js'
import { env } from '../utils/env.js'

const asked = process.argv[2]
const dates = asked === undefined ? runDates() : [asked]
if (dates.length === 0) {
  process.stderr.write(`No captured run under ${env.CASEWORK_RUN_DIR}\n`)
  process.exit(1)
}

const store = openStore(env.CASEWORK_DB)
for (const runDate of dates) {
  const doc = await replayRun(runPath(runDate))
  const built = store.persistRun(doc, new Date().toISOString())
  process.stdout.write(
    `built ${String(built)} causes from ${runDate}: ` +
      `${String(doc.counts.actionable)} actionable of ${String(doc.counts.failing)} failing\n`,
  )
}
store.close()
