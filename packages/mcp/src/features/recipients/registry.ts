// Who a case is addressed to, without saying where. The registry file holds channels and
// addresses; nothing in this module returns an address, and only outreach.send may read one.
import { readFileSync } from 'node:fs'

import { z } from 'zod'

import { PARTY_KINDS, type PartyKind } from '../../constants/enums.js'
import { env } from '../../utils/env.js'

// { "repository": { "LACMTA/los-angeles-regional-gtfs": "...", "*": "..." }, ... }
// Keys that are not party kinds are documentation and are dropped, so the file can explain
// itself in a format that has no comments.
const channelsSchema = z.record(z.string(), z.string())
const registrySchema = z.record(z.string(), z.unknown())

const PARTIES = new Set<string>(PARTY_KINDS)

/** Channels by party, by key. A Map rather than a record: the keys come from a file. */
export type Registry = Map<PartyKind, Map<string, string>>

export function loadRegistry(path: string = env.CASEWORK_REGISTRY_PATH): Registry {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    // A missing registry is the normal state of a fresh clone. Every case then reads as
    // having no channel, which is the correct answer, and nothing pretends otherwise.
    return new Map()
  }
  const registry: Registry = new Map()
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    process.stderr.write(`[registry] ${path} is not valid JSON; ignoring it\n`)
    return registry
  }
  const parsed = registrySchema.safeParse(json)
  if (!parsed.success) {
    // The file exists and is wrong. Silence here reads on screen as "no channel on file",
    // which sends a reader looking for the wrong problem.
    process.stderr.write(`[registry] ${path} is not an object of party kinds; ignoring it\n`)
    return registry
  }
  for (const [party, channels] of Object.entries(parsed.data)) {
    if (!PARTIES.has(party)) continue
    const entries = channelsSchema.safeParse(channels)
    if (!entries.success) {
      process.stderr.write(`[registry] ${path}: ${party} is not a map of channels; ignoring it\n`)
      continue
    }
    registry.set(party as PartyKind, new Map(Object.entries(entries.data)))
  }
  return registry
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
