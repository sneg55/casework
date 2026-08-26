// Enum values are a wire format. A reader gets English, everywhere, not only for cause_kind.
export function words(value: string): string {
  return value.replaceAll('_', ' ')
}

const STATE_GROUPS = new Map<string, readonly string[]>([
  ['watching', ['watching']],
  ['ready', ['ready']],
  ['decided', ['snoozed', 'approved', 'rejected', 'resolved']],
])

export function inStateGroup(state: string, group: string): boolean {
  return group === 'all' || (STATE_GROUPS.get(group)?.includes(state) ?? false)
}

/** `2 feeds`, `1 feed`. A count and its noun always agree on these screens. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${String(n)} ${n === 1 ? singular : plural}`
}

/** The verb form that agrees with `n`: `verb(1, 'point')` is `points`. */
export function verb(n: number, base: string, thirdPerson = `${base}s`): string {
  return n === 1 ? thirdPerson : base
}
