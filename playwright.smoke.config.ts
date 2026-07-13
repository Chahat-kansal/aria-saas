import { defineConfig, devices } from '@playwright/test'

// SECURITY-P1 (8a/8e) — a SEPARATE config from playwright.config.ts (which defaults baseURL to the
// live production site). This one runs against a LOCAL production build (next build && next start,
// not next dev) so smoke-test writes never touch the real production database through the live
// site, and so "does the actual production build work" is what's being asserted, matching the
// BLANK-SCREEN-FIX sprints' verification standard for this repo.
// Next's default port (3000) — no inline PORT=... env-var prefix on the webServer command, since
// that syntax doesn't work under Windows' default shell (cmd.exe) without an extra cross-env
// dependency this repo doesn't otherwise need. Set PORT in the environment before running
// `npm run test:smoke` if 3000 is already in use locally.
const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`

export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: require.resolve('./tests/smoke/global-setup.ts'),
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Builds + starts a real production server before the suite runs. Long timeout — a full
  // `next build` on this repo genuinely takes minutes, not seconds.
  webServer: {
    command: 'npm run build && npm run start',
    url: BASE_URL,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
  },
})
