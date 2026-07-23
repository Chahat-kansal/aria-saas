// CX-GAME-CLOSEOUT — one-off: fire ONE real digest email through the actual sendDailyDigests() code
// path (now routed through the canonical sendEmail(), so it carries the real unsubscribe footer +
// List-Unsubscribe header) for a real, already-persisted Sip leaderboard snapshot. Not run by any
// cron — a manual verification tool. Reads RESEND_API_KEY / SUPABASE creds from your local
// .env.local (Claude could not read this file directly in this session — permission-gated).
//
// Usage: npx tsx scripts/send-test-digest.ts

import 'dotenv/config'
import { config as loadEnvLocal } from 'dotenv'
loadEnvLocal({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'
import { sendDailyDigests } from '../src/lib/community/digest'
import type { LeaderboardRow } from '../src/lib/community/leaderboard'

const SIP_BUSINESS_ID = 'ff5055a0-c351-4ada-817a-1804961035f3'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: snapshot, error } = await supabase
    .from('community_leaderboard_snapshots')
    .select('rows')
    .eq('business_id', SIP_BUSINESS_ID)
    .eq('period', '30d')
    .maybeSingle()
  if (error || !snapshot) {
    console.error('No 30d snapshot found for Sip — run the CX-GAME-CLOSEOUT leaderboard step first.', error?.message)
    process.exit(1)
  }

  const rows = snapshot.rows as LeaderboardRow[]
  console.log(`Found ${rows.length} row(s) in Sip's 30d snapshot. Sending real digest(s)...`)

  const result = await sendDailyDigests(supabase, SIP_BUSINESS_ID, 'Sip Café', rows)
  console.log('Result:', JSON.stringify(result))
  console.log(result.sent > 0
    ? 'Sent — check the inbox on the pos_customers row this ran against (email_consent must be true).'
    : 'Nothing sent — either no consenting recipient, no real delta, or RESEND_API_KEY/consent gated it. Check pos_customers.email/email_consent and the delta since last_digest_at.')
}

main().catch(e => { console.error(e); process.exit(1) })
