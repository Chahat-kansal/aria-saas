// SECURITY-P1 (8b) — logs in once per role and saves storageState, so individual spec files can
// reuse a ready-made session instead of re-running the login flow per test. Reuses the SAME
// TEST_USER_EMAIL/TEST_USER_PASSWORD convention e2e/helpers/auth.ts and tests/e2e/fixtures/auth.ts
// already establish — no new env var names invented for the owner role. Admin is optional
// (TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD): if unset, admin-gated tests that need a real admin
// session are skipped, but the more important negative assertion (a non-admin session is denied
// /admin/costs) still runs using the owner session, which needs no extra credentials.
//
// Never reuse a real production user's password here — these must be dedicated test-only
// credentials in a project the team is comfortable seeding/mutating (see SECURITY-P1-REPORT.md's
// founder env checklist).
import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const AUTH_DIR = join(__dirname, '.auth')
export const OWNER_STATE = join(AUTH_DIR, 'owner.json')
export const ADMIN_STATE = join(AUTH_DIR, 'admin.json')

async function loginAndSave(baseURL: string, email: string, password: string, statePath: string) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL } as never)
  await page.goto('/login')
  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first()
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 })
  await emailInput.fill(email)
  const passwordInput = page.locator('input[type="password"], input[name="password"]').first()
  await passwordInput.fill(password)
  // S9 PHASE 1 (#10) — WAS `getByRole('button', { name: /sign in|log in|continue/i })`, which
  // resolves to THREE controls on /login and failed strict mode before it could click anything:
  //
  //   AuthScene.tsx:208  <button type="button" class="tab">Sign in</button>        the TAB
  //   AuthScene.tsx:214  <button type="button" class="gbtn">Continue with Google</button>
  //   AuthScene.tsx:266  <button type="submit" class="cta">{ctaLabel}</button>     the real one
  //
  // Only the third is inside <form> and only it submits. Adding `.first()` would have "fixed" the
  // error by silently clicking the TAB — which is precisely the bug the e2e fixture had (#12).
  // THE PAGE IS NOT CHANGED: three buttons matching that name is correct product behaviour, and
  // the auth flow is explicitly out of scope. The selector is what was wrong.
  await page.locator('form button[type="submit"]').click()
  // S9 PHASE 1 — SAY WHY, INSTEAD OF TIMING OUT.
  // With the selector fixed, both suites click the real submit and STILL do not navigate — so the
  // login itself is being refused, and a bare `waitForURL` timeout cannot tell anyone whether that
  // is a wrong password or the rate-limit guard. AuthScene renders any failure into `.errbox`
  // (checkAuthGuard's "Too many attempts…" and Supabase's own authError.message both land there),
  // so the fixture now reads it and puts it in the thrown error.
  //
  // This changes NOTHING about the auth flow — it only reports what the page already displays.
  try {
    await page.waitForURL(/\/(pos|dashboard)/, { timeout: 25_000 })
  } catch (e) {
    const shown = await page.locator('.errbox').first().textContent().catch(() => null)
    const url = page.url()
    throw new Error(
      '[login] did not navigate after submitting. url=' + url
      + ' page_error=' + (shown?.trim() || '(none shown — the form did not report an error)')
      + ' | original: ' + (e as Error).message,
    )
  }
  await page.context().storageState({ path: statePath })
  await browser.close()
}

export default async function globalSetup(config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true })
  const baseURL = config.projects[0]?.use?.baseURL as string ?? 'http://localhost:3000'

  const ownerEmail = process.env.TEST_USER_EMAIL
  const ownerPassword = process.env.TEST_USER_PASSWORD
  if (!ownerEmail || !ownerPassword) {
    throw new Error('[smoke/global-setup] TEST_USER_EMAIL and TEST_USER_PASSWORD are required to run the smoke suite.')
  }
  await loginAndSave(baseURL, ownerEmail, ownerPassword, OWNER_STATE)

  const adminEmail = process.env.TEST_ADMIN_EMAIL
  const adminPassword = process.env.TEST_ADMIN_PASSWORD
  if (adminEmail && adminPassword) {
    await loginAndSave(baseURL, adminEmail, adminPassword, ADMIN_STATE)
  } else {
    console.warn('[smoke/global-setup] TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set — the positive admin-access assertion will be skipped (the negative "non-admin denied" assertion still runs).')
  }
}
