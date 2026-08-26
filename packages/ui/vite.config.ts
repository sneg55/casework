import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The env lives at the repository root, next to .env.example, because the same file configures
// the shell tools and the read API. Without this, a VITE_ var set where the docs say to set it
// is silently not read, and the agent dock reports no harness however correct the value is.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const HARNESS_PROXY = '/harness'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, repoRoot, ['CASEWORK_', 'VITE_CASEWORK_'])
  const harness = env['CASEWORK_HARNESS_ORIGIN'] ?? 'http://localhost:8790'

  // The proxy below is a dev-server rule and does not survive `vite build`. A build that bakes
  // in a relative harness URL would ship a dock that calls itself, so it stops here instead.
  const configured = env['VITE_CASEWORK_HARNESS_URL'] ?? ''
  if (command === 'build' && configured.startsWith('/')) {
    throw new Error(
      `VITE_CASEWORK_HARNESS_URL is ${configured}, which only resolves behind the dev proxy. ` +
        'For a build, either set an absolute harness origin that sends CORS headers, or serve ' +
        `${configured} from a reverse proxy in front of the built UI.`,
    )
  }

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
