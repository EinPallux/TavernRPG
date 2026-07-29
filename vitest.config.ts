import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    /**
     * Node is the default on purpose: it enforces the purity rule — anything under
     * src/engine or src/data that reaches for the DOM fails its own test.
     * UI tests opt in per file with a docblock at the top:
     *
     *   // @vitest-environment jsdom
     */
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/state/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
