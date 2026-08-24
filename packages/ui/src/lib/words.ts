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
