// A case's number in the register. Allocated by the order cases were first seen, so a
// number a steward writes in a ticket or says out loud names the same cause next week.
// Position in today's queue would not: that sort key includes consecutive_runs.
const WIDTH = 4

export function docketNumber(rank: number): string {
  return `CW-${String(rank).padStart(WIDTH, '0')}`
}
