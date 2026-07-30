import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Sandboxes/CI images that ship their own Chromium can point at it instead of
        // downloading one: PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
        /*
         * Desktop-first game (docs/tech/ui-ux-style-guide.md §2).
         *
         * **After** the device spread, not before it: `devices['Desktop Chrome']` carries its own
         * 1280×720 viewport, and project-level `use` beats the top-level block — so declaring
         * this up there (as it was until Phase 13) silently ran the whole suite at 1280×720 while
         * claiming 1080p. Two years of "why does this only fail in CI" live in that ordering.
         * The 1366×768 floor still gets tested, explicitly, in `app-shell.spec.ts`.
         */
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
