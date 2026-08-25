#!/usr/bin/env node
// Attribution from a shell, so the queue a judge sees is the queue the agent would build.
// In the product this is one subagent per case, called through cases.attribute; the rules it
// runs are the same either way, and they live in features/attribution.
import { attributeCase } from '../features/attribution/attribute.js'
import { queueRow } from '../features/cases/view.js'
import { latestRunDate } from '../services/runFiles.js'
import { openStore } from '../services/store.js'
import { env } from '../utils/env.js'

const runDate = process.argv[2] ?? latestRunDate()
if (runDate === undefined) {
  process.stderr.write(`No captured run under ${env.CASEWORK_RUN_DIR}\n`)
  process.exit(1)
}

const store = openStore(env.CASEWORK_DB)
const rows = store.listCases().map((row) => queueRow(store, row, runDate))
// Singletons are attributed by the 3-day rule, not by an external check, and each one would
// cost a network round trip to learn nothing. Section 9 of the spec sets the boundary.
const grouped = rows.filter((row) => row.cause_kind !== 'individual')

for (const row of grouped) {
  const result = await attributeCase(store, row.case_id, runDate)
  if (result === undefined) {
    process.stdout.write(`${row.docket} could not be attributed\n`)
    continue
  }
  process.stdout.write(
    `${row.docket} ${result.cause_kind} -> ${result.party_kind}, ` +
      `confidence ${String(result.confidence)} of 3: ${result.finding}\n`,
  )
}
store.close()
process.stdout.write(
  `attributed ${String(grouped.length)} grouped causes from ${runDate}; ` +
    `${String(rows.length - grouped.length)} individual failures wait on the three-run rule\n`,
)
