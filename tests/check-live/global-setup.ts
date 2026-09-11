import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { assertSafeTestBusiness, SEEDED_TEST_BUSINESS_ID } from '../../src/lib/testing/test-business'

/**
 * S6 PHASE 2 — prepare one real turn, and refuse to run at all against anything but a fixture.
 *
 * ⚠️ THE SAFETY ASSERTION RUNS BEFORE ANYTHING ELSE. `check:live` asks a real question and triggers
 * a real proposal; both write rows. If the business id is anything other than a seeded fixture this
 * throws immediately — the decision table's "never touch Sip's live rows", enforced rather than
 * remembered.
 */
const AUTH_DIR = join(__dirname, '.auth')
export const OWNER_STATE = join(AUTH_DIR, 'owner.json')

/** `test.use({ storageState })` needs a file even when the run is blocked and every test skips. */
function writeEmptyState() {
  mkdirSync(AUTH_DIR, { recursive: true })
  writeFileSync(OWNER_STATE, JSON.stringify({ cookies: [], origins: [] }))
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL as string

  // ⚠️ TRIMMED, AND THIS WAS A REAL BUG. `.env.local` holds the email as 23 characters with a
  // LEADING SPACE, and a padded password beside it. dotenv preserves surrounding whitespace, so
  // Supabase was handed an address nobody has an account for and answered 400 invalid_credentials —
  // which reads exactly like a wrong password and sent me looking at the rate limiter first.
  // Nothing else in this repo trims these.
  const email = process.env.TEST_USER_EMAIL?.trim()
  const password = process.env.TEST_USER_PASSWORD?.trim()
  if (!email || !password) {
    throw new Error(
      '[check:live] TEST_USER_EMAIL and TEST_USER_PASSWORD are required. They live in .env.local, '
      + 'which the config loads explicitly. This is a COULD-NOT-CHECK, not a pass: nothing was verified.',
    )
  }

  const businessId = process.env.TEST_BUSINESS_ID?.trim() || SEEDED_TEST_BUSINESS_ID
  assertSafeTestBusiness(businessId, 'run check:live')
  process.env.CHECK_LIVE_BUSINESS_ID = businessId

  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !serviceKey || !anonKey) {
    throw new Error('[check:live] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY are all required.')
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  // ── the fixture must exist and have enough shape to answer a question about money ─────────────
  const { data: biz, error: bizErr } = await db
    .from('businesses').select('id, name, user_id').eq('id', businessId).maybeSingle()
  if (bizErr) throw new Error('[check:live] could not read the test business: ' + bizErr.message)
  if (!biz) {
    throw new Error(
      '[check:live] the seeded business ' + businessId + ' does not exist. '
      + 'Run: npx tsx e2e/helpers/seed.ts (with .env.local exported).',
    )
  }

  const { count: sales, error: salesErr } = await db
    .from('pos_sales').select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).eq('status', 'completed')
  if (salesErr) throw new Error('[check:live] could not count the fixture sales: ' + salesErr.message)
  if (!sales) {
    throw new Error(
      '[check:live] the fixture has no completed sales, so a question about money cannot be answered '
      + 'and any assertion on the answer would be meaningless. Run the seed.',
    )
  }
  console.log('[check:live] fixture "' + biz.name + '" (' + businessId + '), ' + sales + ' completed sales')

  // ⚠️ THE APP PICKS ITS OWN ACTIVE BUSINESS, and it was not this one. The first live run answered
  // as "Smoke Test Café" (…0101) while every DB assertion queried the seeded fixture (…0001) — the
  // question and the verification were about different businesses, so no assertion could ever have
  // lined up. That is the phase-0 seed/resolver mismatch in a THIRD place: `user_active_business`
  // is what resolveOwnerBusinessId reads, and nothing had ever set it for this user.
  const { error: activeErr } = await db.from('user_active_business').upsert(
    { user_id: biz.user_id as string, business_id: businessId, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (activeErr) {
    throw new Error('[check:live] could not pin the active business: ' + activeErr.message
      + ' — without this the app answers about a different business than the one asserted.')
  }
  console.log('[check:live] active business pinned to the fixture')

  // ⚠️ WITHOUT THIS THE CHECK STOPS BEING LIVE AFTER ITS FIRST RUN. The server log gave it away:
  // "[council] cache HIT — epoch: 2026-09-10T18:45". The answer council caches on
  // questionHash + dataEpoch, so asking the same question twice returns the stored CouncilOutput
  // and NEVER CALLS THE MODEL. A check whose whole value is that it is live would have been
  // asserting against a cached answer from an earlier run — green, fast, and proving nothing.
  // Re-dating the seeded sales moves the epoch and forces a miss. It is also what the fixture
  // wants: sales dated today, so "this week" has something in it.
  const { error: freshErr } = await db.from('pos_sales')
    .update({ created_at: new Date().toISOString() })
    .eq('business_id', businessId).eq('status', 'completed')
  if (freshErr) console.warn('[check:live] could not re-date the fixture sales: ' + freshErr.message)
  else console.log('[check:live] fixture sales re-dated (moves the data epoch, defeats the council cache)')

  // ── SIGN IN ───────────────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ THE LOGIN FORM IS NOT DRIVEN, AND THAT IS A DELIBERATE TRADE WITH ITS COST STATED.
  //
  // Driving it cost three things and bought nothing this check needs:
  //   · the stored password is WRONG — 400 invalid_credentials, and `auth.users` confirms the user
  //     exists, is confirmed and has a password, so TEST_USER_PASSWORD simply is not it;
  //   · every attempt burns one of TEN sign-ins per fifteen minutes (api/auth/guard, LIMITS.login),
  //     and two runs plus one diagnostic locked me out for a quarter of an hour;
  //   · the form proved flaky to drive headlessly — the email input timed out on two otherwise
  //     identical runs, and "a flaky live check trains people to ignore red".
  //
  // So the password is probed ONCE by API — deterministic, no page, no rate-limit cost — and the
  // browser is handed a REAL minted session. Not a mock: `admin.generateLink` + `verifyOtp` issues
  // a genuine Supabase session for a real confirmed user, and every assertion after it exercises
  // the real app with real cookies. What is NOT exercised is the login form, and the run says so.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })

  const { error: pwErr } = await anon.auth.signInWithPassword({ email, password })
  if (pwErr) {
    process.env.CHECK_LIVE_PASSWORD_BROKEN =
      'TEST_USER_PASSWORD does not match ' + email + ' (' + pwErr.message + '). The login FORM was '
      + 'not exercised; this run used an admin-minted session. Resetting that password is an '
      + 'authorisation action and is parked.'
    console.warn('[check:live] WARN ' + process.env.CHECK_LIVE_PASSWORD_BROKEN)
  } else {
    console.log('[check:live] the stored password works (the form is still not driven — see above)')
  }

  const { data: gen, error: genErr } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  const hashedToken = gen?.properties?.hashed_token
  let session: Record<string, unknown> | null = null
  if (!genErr && hashedToken) {
    const { data: v, error: vErr } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: hashedToken })
    if (vErr) console.warn('[check:live] verifyOtp failed: ' + vErr.message)
    if (v?.session) session = v.session as unknown as Record<string, unknown>
  }
  if (!session) {
    process.env.CHECK_LIVE_BLOCKED =
      'could not mint a session for ' + email + ' (' + (genErr?.message ?? 'verifyOtp returned no session')
      + '). NOTHING WAS CHECKED.'
    console.warn('[check:live] BLOCKED ' + process.env.CHECK_LIVE_BLOCKED)
    writeEmptyState()
    return
  }

  // @supabase/ssr 0.10 reads `sb-<ref>-auth-token` as `base64-<base64 json>`, chunked past ~3.2KB.
  // Navigating the magic link instead cannot work here: Supabase rewrites redirect_to to the
  // allowlisted site URL — observed, http://localhost:3100/auth/callback became
  // https://www.ariaos.site — so the session would land on the wrong origin entirely.
  const ref = new URL(url).hostname.split('.')[0]
  const cookieName = 'sb-' + ref + '-auth-token'
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const CHUNK = 3180
  const cookies = value.length > CHUNK
    ? Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({
        name: cookieName + '.' + i, value: value.slice(i * CHUNK, (i + 1) * CHUNK),
        domain: 'localhost', path: '/',
      }))
    : [{ name: cookieName, value, domain: 'localhost', path: '/' }]

  mkdirSync(AUTH_DIR, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL } as never)
  await context.addCookies(cookies)
  const page = await context.newPage()
  await page.goto('/dashboard/ask-aria', { waitUntil: 'domcontentloaded' })
  if (new URL(page.url()).pathname.startsWith('/login')) {
    process.env.CHECK_LIVE_BLOCKED =
      'a real session was minted but the app did not accept the cookie (landed on ' + page.url()
      + '). NOTHING WAS CHECKED.'
    console.warn('[check:live] BLOCKED ' + process.env.CHECK_LIVE_BLOCKED)
    await browser.close()
    writeEmptyState()
    return
  }
  await context.storageState({ path: OWNER_STATE })
  await browser.close()
  console.log('[check:live] session ready for ' + email)
}
