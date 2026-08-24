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

const envSchema = z.object({
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Casework ─────────────────────────────────────────────────────────────
  // Paths are relative to the repository root, which is where the server is started.
  CASEWORK_RUN_DIR: z.string().default('data/runs'),
  CASEWORK_OUTBOX_DIR: z.string().default('data/outbox'),
  CASEWORK_DB: z.string().default('data/casework.sqlite'),
  CASEWORK_PROBE: z.string().default('scripts/probe_catalog.py'),
  CASEWORK_PYTHON: z.string().default('python3'),

  // Holds addresses. Never committed, never read outside outreach.send.
  CASEWORK_REGISTRY_PATH: z.string().default('registry.local.json'),

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
