import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The DOM tests render real components, which means real JSX.
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Node stays the default. jsdom costs ~3s per file to stand up, and all but a
    // handful of these suites are pure logic that never touches a DOM — running
    // everything under it turned a 1.7s suite into 8.3s. The files that do need a
    // document opt in with a `@vitest-environment jsdom` docblock at the top.
    environment: 'node',
    // Left off deliberately: every existing test imports describe/it/expect from
    // 'vitest' explicitly, and turning globals on would make both styles valid.
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
  },
})
