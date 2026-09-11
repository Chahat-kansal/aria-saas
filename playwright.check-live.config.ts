import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

/**
 * S6 — `check:live`. ONE real question and ONE real proposed action, end to end.
 *
 * ⚠️ THIS IS NOT ANOTHER TEST SUITE. It is a handful of assertions that touch the real database,
 * the real model and the real surface. Its value is that it is LIVE, not that it is thorough.
 * Every static gate this repo has — tsc, vitest, ESLint, `next build`, the canon rail — passed for
 * every one of the seven shipped failures in `RUN-S6.md`'s table. None of them proves a feature
 * does anything.
 *
 * ⚠️ IT LOADS `.env.local` EXPLICITLY, and that is not incidental. **Playwright does not load
 * `.env.local`** — the smoke suite's global setup throws when `TEST_USER_EMAIL` is unset, and the
 * variable lives only in `.env.local`, so `npm run test:smoke` fails at setup for anyone who has
 * not exported it by hand. Loading it here is the difference between a check that runs and a check
 * that reports six missing credentials and stops.
 *
 * Runs against a LOCAL PRODUCTION BUILD (`next build && next start`), never `next dev`, for the
 * same reason the smoke config does: "does the production build work" is the question.
 */
loadEnv({ path: '.env.local' })
// The seed and the DB assertions read SUPABASE_URL; the app reads NEXT_PUBLIC_SUPABASE_URL. They
// are the same project, and only one of the two names is in .env.local.
if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
}

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`

export default defineConfig({
  testDir: './tests/check-live',
  fullyParallel: false,
  workers: 1,
  // ⚠️ NO RETRIES, EVER. "A flaky live check trains people to ignore red — that is worse than no
  // check." A retry turns a real intermittent failure into a green run, which is the one outcome
  // this command must never produce.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  // A real model call on the hero path can take 45s; the council can take longer.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  globalSetup: require.resolve('./tests/check-live/global-setup.ts'),
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    url: BASE_URL,
    timeout: 900_000,
    reuseExistingServer: !process.env.CI,
  },
})
