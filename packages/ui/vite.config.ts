import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The env lives at the repository root, next to .env.example, because the same file configures
// the shell tools and the read API. Without this, a VITE_ var set where the docs say to set it
// is silently not read, and the agent dock reports no harness however correct the value is.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const HARNESS_PROXY = '/harness'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, 'CASEWORK_')
  const harness = env['CASEWORK_HARNESS_ORIGIN'] ?? 'http://localhost:8790'
  return {
    plugins: [react()],
    envDir: repoRoot,
    server: {
      port: 5273,
      // A standalone TrueForge harness answers without CORS headers and 404s the preflight, so
      // a browser on this port cannot call it directly. Proxying makes the call same-origin,
      // which is why VITE_CASEWORK_HARNESS_URL is set to this path and not to the harness URL.
      proxy: {
        [HARNESS_PROXY]: {
          target: harness,
          changeOrigin: true,
          ws: true,
          rewrite: (path: string) => path.replace(new RegExp(`^${HARNESS_PROXY}`), ''),
        },
      },
    },
  }
})
