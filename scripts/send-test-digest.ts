// CX-GAME-CLOSEOUT — one-off: fire ONE real digest email through the actual sendDailyDigests() code
// path (now routed through the canonical sendEmail(), so it carries the real unsubscribe footer +
// List-Unsubscribe header) for a real, already-persisted Sip leaderboard snapshot. Not run by any
// cron — a manual verification tool. Reads RESEND_API_KEY / SUPABASE creds from your local
// .env.local (Claude could not read this file directly in this session — permission-gated).
//
// CX-GAME-DIGEST-FIX — this now calls sendDailyDigests() exactly as the real cron does (no more
// reading/passing its own snapshot — digest.ts sources that itself from the persisted row, see its
// doc comment). Pass --force to bypass the same-day claim guard (claim_daily_digest_send's p_force)
// so you can send twice in a row while testing without editing the DB by hand — the real cron never
// passes this. Every --force send is loud in the log; there is no silent bypass.
//
// Usage: npx tsx scripts/send-test-digest.ts [--force]

import 'dotenv/config'
import { config as loadEnvLocal } from 'dotenv'
loadEnvLocal({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'
import { sendDailyDigests } from '../src/lib/community/digest'

const SIP_BUSINESS_ID = 'ff5055a0-c351-4ada-817a-1804961035f3'

async function main() {
  const force = process.argv.includes('--force')
  if (force) console.log('--force set: bypassing the same-day claim guard for this run only.')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const result = await sendDailyDigests(supabase, SIP_BUSINESS_ID, 'Sip Café', { force })
  console.log('Result:', JSON.stringify(result))
  console.log(result.sent > 0
    ? 'Sent — check the inbox on the pos_customers row this ran against (email_consent must be true).'
    : 'Nothing sent — either no consenting recipient, no real delta, or the day is already claimed (rerun with --force to bypass). Check pos_customers.email/email_consent.')
}

main().catch(e => { console.error(e); process.exit(1) })
