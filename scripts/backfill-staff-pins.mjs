/**
 * SEC-PIN-1 — one-time backfill of pin_hash + pin_lookup from the existing plaintext PINs.
 *
 * IDEMPOTENT: only touches rows where pin is set and pin_hash is null. Safe to re-run; re-running
 * after a partial failure picks up exactly where it stopped.
 *
 * The plaintext column is NOT modified or cleared — that is SEC-PIN-2, after this is verified and
 * the routes are confirmed live. Rollback for this script is simply reverting the route commit.
 *
 * Run:  node scripts/backfill-staff-pins.mjs
 * Needs: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, STAFF_PIN_PEPPER
 *        — all read from env with NO fallback (see SEC-MANAGER-1: an auth secret never gets a default).
 */
// This repo keeps secrets in .env.local, not .env — `import 'dotenv/config'` loads .env only and
// found nothing, so the script refused to run (correctly, but for the wrong reason). Explicit path.
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { createHmac } from 'crypto'

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PEPPER = process.env.STAFF_PIN_PEPPER

for (const [name, v] of [['SUPABASE_URL', URL], ['SUPABASE_SERVICE_ROLE_KEY', KEY], ['STAFF_PIN_PEPPER', PEPPER]]) {
  if (!v) { console.error('Missing ' + name + ' — refusing to run.'); process.exit(1) }
}

const db = createClient(URL, KEY, { auth: { persistSession: false } })
const lookup = (businessId, pin) => createHmac('sha256', PEPPER).update(businessId + ':' + pin).digest('hex')

async function backfill(table) {
  let done = 0, skipped = 0
  for (;;) {
    const { data, error } = await db.from(table)
      .select('id, business_id, pin')
      .not('pin', 'is', null)
      .is('pin_hash', null)
      .limit(200)
    if (error) { console.error('[' + table + '] read failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break

    for (const row of data) {
      const pin = String(row.pin ?? '')
      if (!pin) { skipped++; continue }
      const patch = { pin_hash: await bcrypt.hash(pin, 10), pin_lookup: lookup(String(row.business_id), pin) }
      const { error: upErr } = await db.from(table).update(patch).eq('id', row.id)
      if (upErr) {
        // A unique-violation here means two staff at one business share a PIN. The index is doing
        // its job; the data needs a human decision about who is who. Do not paper over it.
        console.error('[' + table + '] row ' + row.id + ' failed:', upErr.message)
        process.exit(1)
      }
      done++
    }
    if (data.length < 200) break
  }
  return { done, skipped }
}

const users = await backfill('pos_users')
const staff = await backfill('pos_staff')
console.log('pos_users:', users)
console.log('pos_staff:', staff)

for (const t of ['pos_users', 'pos_staff']) {
  const { data } = await db.from(t).select('pin, pin_hash, pin_lookup')
  const rows = data ?? []
  console.log(t, {
    have_pin: rows.filter(r => r.pin != null).length,
    have_hash: rows.filter(r => r.pin_hash != null).length,
    have_lookup: rows.filter(r => r.pin_lookup != null).length,
  })
}
console.log('All three counts must match per table.')
