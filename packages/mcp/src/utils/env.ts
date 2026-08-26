// Single env boundary. See guides/zod-at-the-boundary.md.
//
// Rules:
//   1. This file is the ONLY place `process.env` is read.
//     (The ESLint config enforces this via no-restricted-properties.)
//   2. The schema is the source of truth for the `Env` type.
//   3. `envSchema.parse` throws at import time - fail fast on misconfiguration.
//   4. Add new vars here, declare their shape, provide a default where sensible.
//
// Consumers:
//   import { env } from '@/env'
//   fetch(env.API_URL, { signal })

import { z } from 'zod'

import { fromRoot } from './repoRoot.js'

// Relative paths resolve against the repository root, not the cwd, so a workspace script
// finds data/runs wherever npm chose to run it from.
const rootPath = (fallback: string) => z.string().default(fallback).transform(fromRoot)

const envSchema = z.object({
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Casework ─────────────────────────────────────────────────────────────
  // The read API the screens fetch from. The UI's own default matches this one.
  CASEWORK_API_PORT: z.coerce.number().int().positive().default(8791),
  // 8790 is the harness's own port, so the MCP door sits above the read API's.
  CASEWORK_MCP_PORT: z.coerce.number().int().positive().default(8792),

  CASEWORK_RUN_DIR: rootPath('data/runs'),
  CASEWORK_OUTBOX_DIR: rootPath('data/outbox'),
  CASEWORK_DB: rootPath('data/casework.sqlite'),
  CASEWORK_PROBE: rootPath('scripts/probe_catalog.py'),
  CASEWORK_PYTHON: z.string().default('python3'),

  // Holds addresses. Never committed, never read outside outreach.send.
  CASEWORK_REGISTRY_PATH: rootPath('registry.local.json'),

  // Optional. repo.inspect works unauthenticated; a token raises the API rate limit.
  GITHUB_TOKEN: z.string().min(1).optional(),
}) satisfies z.ZodType

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  // eslint-disable-next-line no-restricted-properties -- the one permitted read in the codebase; everything else imports `env` from here
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    // Render a readable error at startup. One bad env var should surface the
    // exact field and reason, not crash 10 stack frames deep.
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)

    console.error(`[env] invalid configuration:\n${lines.join('\n')}`)
    process.exit(1)
  }
  return parsed.data
}

export const env = loadEnv()
