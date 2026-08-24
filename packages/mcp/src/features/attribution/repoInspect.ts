// repo.inspect. The step that turns "eleven agencies are 404" into "one repository owner
// removed the paths", which is the whole difference between this and a link checker.
import { z } from 'zod'

import { env } from '../../utils/env.js'

const GITHUB = 'https://api.github.com'

const repoSchema = z.object({
  full_name: z.string(),
  private: z.boolean(),
  archived: z.boolean(),
  pushed_at: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
})

const entrySchema = z.object({ name: z.string(), type: z.string() })

export interface RepoFacts {
  owner: string
  repo: string
  exists: boolean
  archived: boolean
  private: boolean
  pushed_at: string | null
  description: string | null
  html_url: string | null
  paths_present: string[]
  paths_missing: string[]
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

function headers(): Record<string, string> {
  const base: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'casework-mcp/0.1',
  }
  if (env.GITHUB_TOKEN !== undefined) base['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`
  return base
}

/** Owner and repository from a raw.githubusercontent.com path, plus the directory a feed
 * lives in. `/LACMTA/los-angeles-regional-gtfs/main/bellflower-ca-us/x.zip` -> the first
 * segment after the branch. */
export function splitRawPath(path: string): {
  owner: string | undefined
  repo: string | undefined
  dir: string | undefined
} {
  const [owner, repo, , dir] = path.split('/').filter((s) => s !== '')
  return { owner, repo, dir }
}

export async function inspectRepo(
  owner: string,
  repo: string,
  expectedPaths: readonly string[] = [],
  fetcher: Fetcher = fetch,
): Promise<RepoFacts> {
  const base: RepoFacts = {
    owner,
    repo,
    exists: false,
    archived: false,
    private: false,
    pushed_at: null,
    description: null,
    html_url: null,
    paths_present: [],
    paths_missing: [...expectedPaths],
  }

  const meta = await fetcher(`${GITHUB}/repos/${owner}/${repo}`, { headers: headers() })
  if (!meta.ok) return base

  const info = repoSchema.parse(await meta.json())
  const contents = await fetcher(`${GITHUB}/repos/${owner}/${repo}/contents/`, {
    headers: headers(),
  })
  const entries = contents.ok ? z.array(entrySchema).parse(await contents.json()) : []
  const present = new Set(entries.filter((e) => e.type === 'dir').map((e) => e.name))

  return {
    ...base,
    exists: true,
    archived: info.archived,
    private: info.private,
    pushed_at: info.pushed_at,
    description: info.description,
    html_url: info.html_url,
    paths_present: [...present].sort(),
    paths_missing: expectedPaths.filter((p) => !present.has(p)),
  }
}
