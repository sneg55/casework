// A case's number in the register. Stable within a run and ordered the way the queue is,
// so "CW-0001" names the same thing on screen, in a screenshot and out loud.
export function docketNumber(index: number): string {
  return `CW-${String(index + 1).padStart(4, '0')}`
}
