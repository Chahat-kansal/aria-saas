import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'https://www.ariaos.site'

// CI-E2E-1 — testDir used to be './e2e' only, which silently excluded the
// 6 specs under tests/e2e/ (a separately-architected suite using its own
// fixtures/auth.ts) from every run, local or CI. testMatch covers both.
export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'tests/e2e/**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // CI-E2E-1 follow-up — logs in ONCE for the whole run (e2e/helpers/global-setup.ts) instead of
  // e2e/'s and tests/e2e/'s two independent per-test login implementations, which together
  // exhausted the login endpoint's own rate limit partway through the first real full-suite run.
  // No global `use.storageState` here deliberately — several specs (api.spec.ts's 401 checks,
  // community's public-access tests, the marketing site) intentionally test UNAUTHENTICATED
  // behavior; only login()/authedPage (used by the specs that need a session) reuse the cache.
  globalSetup: require.resolve('./e2e/helpers/global-setup.ts'),
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
