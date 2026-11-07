import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
    // the suite runs as the demo deployment; tests of a non-demo deployment switch DEMO_MODE off themselves
    env: { APP_SECRET: 'test-secret', DEMO_MODE: 'true' },
  },
})
