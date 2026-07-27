import type { Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// CI-E2E-1 follow-up — a real first full-suite run (52 failures) found e2e/helpers/auth.ts's
// login() and tests/e2e/fixtures/auth.ts's authedPage fixture independently re-logging-in on
// EVERY test, no session reuse. ~86 credentialed tests running serially against the real login
// endpoint exhausted its own rate limit (src/app/api/auth/guard/route.ts: 10 requests/15min per
// IP) partway through, cascading into ~48 failures that were really one problem. See the actual
// captured page snapshot from that run: "Too many attempts. Please wait before trying again."
//
// global-setup.ts logs in ONCE and writes the resulting session here; restoreCachedSession()
// replays it (cookies + localStorage) into each test's own context instead of submitting the
// login form again. A real login only happens once per suite run (in global-setup) plus a
// fallback inside login()/authedPage if the cache is ever missing or goes stale mid-run.
export const OWNER_STATE_PATH = join(__dirname, '..', '.auth', 'owner.json')

interface StoredCookie {
  name: string; value: string; domain: string; path: string
  expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None'
}
interface StoredState {
  cookies: StoredCookie[]
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>
}

/** Replay global-setup's cached login session into the current test's context. Returns true if a
 * valid (non-expired) cached session was found and applied — the caller can skip a real login.
 * Returns false if there's no cache, it's unreadable, or replaying it didn't actually authenticate
 * (e.g. the session expired) — the caller must fall back to a real form-based login. */
export async function restoreCachedSession(page: Page): Promise<boolean> {
  if (!existsSync(OWNER_STATE_PATH)) return false
  let state: StoredState
  try { state = JSON.parse(readFileSync(OWNER_STATE_PATH, 'utf8')) } catch { return false }
  if (!state.cookies?.length) return false

  await page.context().addCookies(state.cookies)

  // localStorage is origin-scoped — the page must actually be on that origin before
  // page.evaluate() can set it, so navigate first.
  await page.goto('/dashboard')
  for (const o of state.origins ?? []) {
    if (!o.localStorage?.length) continue
    await page.evaluate((entries) => {
      for (const e of entries) localStorage.setItem(e.name, e.value)
    }, o.localStorage)
  }

  return !/\/login/.test(page.url())
}

// CI-E2E-1 follow-up (second re-run finding) — the first fix (outlet seed + correct staff-bypass
// shape) got both suites past the "Who's working today?" PIN screen, but a page snapshot at the
// moment of failure (captured via error-context, see /pos.spec.ts's own comment) revealed a THIRD,
// separate gate underneath: POS terminal shows "Register is closed. Enter your opening float to
// start trading." with an "Open Register" button (pre-filled float, no typing needed) BEFORE the
// product grid / .aria-pulse-rail / cart ever render. A fresh business's terminal starts with no
// open shift, same as it would for a real new customer. Shared since both e2e/pos.spec.ts and
// tests/e2e/02-terminal.spec.ts hit this identically.
export async function openRegisterIfNeeded(page: Page): Promise<void> {
  const openBtn = page.getByRole('button', { name: /open register/i })
  if (await openBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await openBtn.click()
    await page.waitForTimeout(800)
  }
}
