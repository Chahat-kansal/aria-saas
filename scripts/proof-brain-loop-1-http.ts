/**
 * BRAIN-LOOP-1 PROOF (FULL CHAIN, REAL HTTP) — proves the sprint's actual deliverable end to end
 * through the running app, not through re-implemented SQL:
 *
 *   surfaced hypothesis -> Decisions queue card -> owner taps Approve (POST /api/owner/decisions)
 *   -> bridge calls the EXISTING PATCH /api/aria/hypotheses/[id] -> aria_actions row created
 *   -> onActionApproved() -> baseline_metric_cents populated
 *
 * The session is minted with the app's own @supabase/ssr client writing into a script-side cookie
 * jar, so the cookie format is produced by the library rather than guessed.
 *
 * Run (dev server on :3311): npx tsx scripts/proof-brain-loop-1-http.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const BASE = 'http://localhost:3311'
const SIP = 'ff5055a0-c351-4ada-817a-1804961035f3'
const OWNER_EMAIL = 'cnkansal1105@gmail.com'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function main() {
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

  // ── mint a real session for the Sip owner ────────────────────────────────────────────────────
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: OWNER_EMAIL })
  if (linkErr) throw linkErr
  const tokenHash = (link.properties as Record<string, string>).hashed_token

  const jar = new Map<string, string>()
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(c => jar.set(c.name, c.value)),
    },
  })
  const { error: otpErr } = await ssr.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  if (otpErr) throw otpErr
  const cookieHeader = Array.from(jar, ([n, v]) => n + '=' + v).join('; ')
  console.log('session minted for owner; cookies:', Array.from(jar.keys()).join(', '), '\n')

  // ── pick a surfaced hypothesis that has a pending Decisions card ──────────────────────────────
  const ACTION = (process.argv[2] === 'decline' ? 'decline' : 'approve') as 'approve' | 'decline'
  const { data: hyps } = await admin.from('aria_hypotheses')
    .select('id, title, category, status, decision_id, action_id, baseline_metric_cents')
    .eq('business_id', SIP).not('decision_id', 'is', null).eq('status', 'active').limit(1)
  const hyp = (hyps ?? [])[0] as Record<string, unknown>
  if (!hyp) throw new Error('no surfaced hypothesis available')
  console.log('-- BEFORE --'); console.log(JSON.stringify(hyp, null, 2))

  // ── the owner taps Approve on the Decisions queue ─────────────────────────────────────────────
  const res = await fetch(BASE + '/api/owner/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify({ business_id: SIP, id: hyp.decision_id, action: ACTION }),
  })
  console.log('\nPOST /api/owner/decisions ->', res.status, (await res.text()).slice(0, 300))

  // the baseline snapshot runs in waitUntil(); give it a moment to land
  await new Promise(r => setTimeout(r, 6000))

  const { data: after } = await admin.from('aria_hypotheses')
    .select('id, status, accepted_at, decision_id, action_id, baseline_metric_cents')
    .eq('id', hyp.id as string).maybeSingle()
  console.log('\n-- AFTER --'); console.log(JSON.stringify(after, null, 2))

  const a = (after ?? {}) as Record<string, unknown>
  if (a.action_id) {
    const { data: action } = await admin.from('aria_actions')
      .select('id, title, status, source, payload').eq('id', a.action_id as string).maybeSingle()
    console.log('\n-- LINKED aria_actions ROW --'); console.log(JSON.stringify(action, null, 2))
  }

  // baseline_metric_cents lives on aria_outcomes (written by onActionApproved), NOT on the
  // hypothesis row — checking the hypothesis column reported a false failure on the first run.
  const { data: outcome } = await admin.from('aria_outcomes')
    .select('id, action_id, category, acted_on, baseline_metric_cents, outcome_verdict')
    .eq('action_id', (a.action_id as string) ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  console.log('\n-- aria_outcomes (the baseline snapshot) --'); console.log(JSON.stringify(outcome, null, 2))

  console.log('\n-- CHAIN VERDICT --')
  console.log(JSON.stringify({
    reached_decisions_queue: !!a.decision_id,
    accepted:                a.status === 'accepted',
    aria_actions_row:        !!a.action_id,
    declined:                a.status === 'rejected',
    baseline_metric_cents:   (outcome as Record<string, unknown> | null)?.baseline_metric_cents ?? null,
    baseline_populated:      (outcome as Record<string, unknown> | null)?.baseline_metric_cents != null,
  }, null, 2))
}
main().then(() => process.exit(0)).catch(e => { console.error('PROOF FAILED:', e); process.exit(1) })
