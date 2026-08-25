import { defineConfig } from 'vitest/config'

// The suite must not read whatever the developer happens to have on disk. A local
// registry.local.json would otherwise make "no channel on file" pass in CI and fail at home,
// and a test must never be able to write into the real outbox.
export default defineConfig({
  test: {
    env: {
      CASEWORK_REGISTRY_PATH: 'packages/mcp/tests/fixtures/no-registry.json',
      CASEWORK_OUTBOX_DIR: 'packages/mcp/tests/fixtures/outbox',
    },
  },
})
