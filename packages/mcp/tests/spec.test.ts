// The spec is the authority on the closed enums, and CLAUDE.md requires it to move in the same
// commit as the behaviour. That only holds if something checks. A review caught `auth_rejected`
// implemented as a transport investigation while section 9 had no row for it at all.
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { CAUSE_KINDS, PARTY_KINDS } from '../src/constants/enums.js'

const spec = readFileSync('docs/SPEC.md', 'utf8')

/** One numbered section, from its heading to the next one. */
function section(n: number): string {
  const parts = spec.split(/^## /m)
  const found = parts.find((part) => part.startsWith(`${String(n)}. `))
  if (found === undefined) throw new Error(`spec has no section ${String(n)}`)
  return found
}

/** The cause kinds named in the first column of a section 9 table row, one row per line. */
function investigated(): string[] {
  return section(9)
    .split('\n')
    .filter(
      (line) => line.startsWith('|') && !line.startsWith('| Cause kind') && !line.includes('---'),
    )
    .flatMap((line) => (line.split('|')[1] ?? '').match(/`([a-z_]+)`/g) ?? [])
    .map((name) => name.replaceAll('`', ''))
}

describe('the spec and the enums agree', () => {
  it('gives every cause kind its own investigation row in section 9', () => {
    const rows = investigated()
    expect(rows.length).toBeGreaterThan(0)
    expect(CAUSE_KINDS.filter((kind) => !rows.includes(kind))).toEqual([])
  })

  it('puts nothing in that table which is not a cause kind', () => {
    const declared: readonly string[] = CAUSE_KINDS
    expect(investigated().filter((kind) => !declared.includes(kind))).toEqual([])
  })

  it('names every party kind in section 9, so no cause resolves to an undocumented recipient', () => {
    const attribution = section(9)
    const missing = PARTY_KINDS.filter((kind) => !attribution.includes(`\`${kind}\``))
    expect(missing).toEqual([])
  })

  it('lists the same cause kinds in section 6 that the code declares', () => {
    const dataModel = section(6)
    const missing = CAUSE_KINDS.filter((kind) => !dataModel.includes(kind))
    expect(missing).toEqual([])
  })
})
