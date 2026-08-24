// The rule that decides whether approve can be pressed. No address is involved.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { channelKey, isResolvable, loadRegistry } from '../src/features/recipients/registry.js'

const CAUSE = 'raw.githubusercontent.com/LACMTA/los-angeles-regional-gtfs|not_found'

function registryFile(contents: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'casework-reg-')), 'registry.local.json')
  writeFileSync(path, JSON.stringify(contents))
  return path
}

describe('the recipient registry', () => {
  it('reads the channel key off the cause key, without the status class', () => {
    expect(channelKey(CAUSE)).toBe('raw.githubusercontent.com/LACMTA/los-angeles-regional-gtfs')
  })

  it('treats a missing registry as nothing being resolvable', () => {
    const registry = loadRegistry(join(tmpdir(), 'casework-does-not-exist.json'))
    expect(isResolvable(registry, 'repository', CAUSE, false)).toBe(false)
  })

  it('resolves a party with a channel for that exact key', () => {
    const registry = loadRegistry(
      registryFile({
        repository: { 'raw.githubusercontent.com/LACMTA/los-angeles-regional-gtfs': 'x' },
      }),
    )
    expect(isResolvable(registry, 'repository', CAUSE, false)).toBe(true)
    expect(isResolvable(registry, 'host_operator', CAUSE, false)).toBe(false)
  })

  it('accepts a wildcard channel for a party', () => {
    const registry = loadRegistry(registryFile({ catalog: { '*': 'x' } }))
    expect(isResolvable(registry, 'catalog', 'transitfeeds.com|auth_rejected', false)).toBe(true)
  })

  it('resolves an agency only when the catalog has a contact on file', () => {
    const registry = loadRegistry(registryFile({}))
    expect(isResolvable(registry, 'agency', 'example.org|not_found', true)).toBe(true)
    expect(isResolvable(registry, 'agency', 'example.org|not_found', false)).toBe(false)
  })
})
