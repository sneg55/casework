// What a fresh clone has to get right before anything else works: the paths a workspace
// script resolves, and the recipient registry a judge copies into place.
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isResolvable, loadRegistry } from '../src/features/recipients/registry.js'
import { fromRoot, REPO_ROOT } from '../src/utils/repoRoot.js'

const EXAMPLE = join(REPO_ROOT, 'registry.example.json')

describe('paths', () => {
  it('finds the repository root rather than whatever cwd npm chose', () => {
    const manifest: unknown = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
    expect((manifest as { name: string }).name).toBe('casework')
  })

  it('resolves a spec path against the root, so a workspace script finds data/runs', () => {
    const runs = fromRoot('data/runs')
    expect(isAbsolute(runs)).toBe(true)
    expect(runs).toBe(join(REPO_ROOT, 'data', 'runs'))
  })

  it('leaves an absolute path alone', () => {
    expect(fromRoot(join(REPO_ROOT, 'data'))).toBe(join(REPO_ROOT, 'data'))
  })
})

describe('the committed registry example', () => {
  it('parses, and resolves the parties the three grouped causes are addressed to', () => {
    const registry = loadRegistry(EXAMPLE)
    expect(
      isResolvable(registry, 'repository', 'raw.githubusercontent.com/LACMTA/x|not_found', false),
    ).toBe(true)
    expect(
      isResolvable(registry, 'host_operator', 'gtfs.calitp.org|content_type_mismatch', false),
    ).toBe(true)
    expect(isResolvable(registry, 'catalog', 'transitfeeds.com|auth_rejected', false)).toBe(true)
  })

  it('holds no address anyone could actually be written to', () => {
    const raw = readFileSync(EXAMPLE, 'utf8')
    for (const address of raw.matchAll(/[\w.+-]+@[\w.-]+/g)) {
      expect(address[0]).toMatch(/\.invalid$/)
    }
  })

  it('ignores the documentation key rather than failing the whole file over it', () => {
    const registry = loadRegistry(EXAMPLE)
    expect([...registry.keys()].sort()).toEqual([
      'catalog',
      'cert_holder',
      'host_operator',
      'repository',
    ])
  })

  it('still treats an agency as resolvable only when the catalog carries a contact', () => {
    const registry = loadRegistry(EXAMPLE)
    expect(isResolvable(registry, 'agency', 'example.org|not_found', false)).toBe(false)
    expect(isResolvable(registry, 'agency', 'example.org|not_found', true)).toBe(true)
  })
})
