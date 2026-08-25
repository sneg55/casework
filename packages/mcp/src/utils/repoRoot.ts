// Every CASEWORK_* path in the spec is written relative to the repository root, and npm runs
// a workspace script with the workspace as its cwd. Resolving against the root rather than
// the cwd is what lets `npm run api -w @casework/mcp` find data/runs.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function isRoot(dir: string): boolean {
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) return false
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
    return (parsed as { name?: unknown }).name === 'casework'
  } catch {
    return false
  }
}

function findRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    if (isRoot(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) return process.cwd()
    dir = parent
  }
}

export const REPO_ROOT = findRoot()

/** Absolute paths are the caller's own business; relative ones belong to the root. */
export function fromRoot(path: string): string {
  return resolve(REPO_ROOT, path)
}
