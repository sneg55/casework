#!/usr/bin/env node
// Put the store back to the state a rehearsal starts from: no drafts, no decisions, and every
// case at whatever the run files say. For recording a demo, where each take has to begin from
// the same screen.
//
// It clears rows rather than deleting the database file, so it can be run while the read API
// and the MCP server are up. Deleting the file under a live connection leaves both of them
// serving an unlinked copy, which looks like the reset silently did nothing.
import { rmSync } from 'node:fs'

import { runDates, runPath } from '../services/runFiles.js'
import { replayRun } from '../services/sandbox.js'
import { openStore } from '../services/store.js'
import { env } from '../utils/env.js'

const dates = runDates()
if (dates.length === 0) {
  process.stderr.write(`No captured run under ${env.CASEWORK_RUN_DIR}\n`)
  process.exit(1)
}

const store = openStore(env.CASEWORK_DB)
const cleared = store.db.transaction(() => {
  const drafts = store.db.prepare('DELETE FROM drafts').run().changes
  const decisions = store.db.prepare('DELETE FROM decisions').run().changes
  // Back to the run counter's own answer. `persistRun` preserves a human state on purpose, so
  // leaving these set would carry an approval from the last take into the next one.
  store.db.prepare("UPDATE cases SET state = 'watching', snoozed_until = NULL").run()
  return { drafts, decisions }
})()

for (const runDate of dates) {
  const doc = await replayRun(runPath(runDate))
  store.persistRun(doc, new Date().toISOString())
}
store.close()

rmSync(env.CASEWORK_OUTBOX_DIR, { recursive: true, force: true })

process.stdout.write(
  `reset: ${String(cleared.drafts)} drafts and ${String(cleared.decisions)} decisions removed, ` +
    `${String(dates.length)} runs replayed, outbox emptied\n`,
)
