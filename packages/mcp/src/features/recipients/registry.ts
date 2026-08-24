// Who a case is addressed to, without saying where. The registry file holds channels and
// addresses; nothing in this module returns an address, and only outreach.send may read one.
import { readFileSync } from 'node:fs'

import { z } from 'zod'

import { PARTY_KINDS, type PartyKind } from '../../constants/enums.js'
import { env } from '../../utils/env.js'

// { "repository": { "LACMTA/los-angeles-regional-gtfs": "...", "*": "..." }, ... }
const registrySchema = z.record(z.enum(PARTY_KINDS), z.record(z.string(), z.string()))

/** Channels by party, by key. A Map rather than a record: the keys come from a file. */
export type Registry = Map<PartyKind, Map<string, string>>

export function loadRegistry(path: string = env.CASEWORK_REGISTRY_PATH): Registry {
  try {
    const parsed = registrySchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    return new Map(
      Object.entries(parsed).map(([party, channels]) => [
        party as PartyKind,
        new Map(Object.entries(channels)),
      ]),
    )
  } catch {
    // A missing registry is the normal state of a fresh clone. Every case then reads as
    // unattributed, which is the correct answer, and nothing pretends otherwise.
    return new Map()
  }
}

/** The channel key for a cause: the repository, the host, or the catalog itself. */
export function channelKey(causeKey: string): string {
  const [locator] = causeKey.split('|')
  return locator ?? causeKey
}

export function isResolvable(
  registry: Registry,
  party: PartyKind,
  causeKey: string,
  contactOnFile: boolean,
): boolean {
  if (party === 'agency') return contactOnFile
  const channels = registry.get(party)
  if (channels === undefined) return false
  return channels.has(channelKey(causeKey)) || channels.has('*')
}
