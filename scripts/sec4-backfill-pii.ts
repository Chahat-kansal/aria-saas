import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../src/lib/supabase-admin')
  const { encryptCustomerPII } = await import('../src/lib/aria/customer-pii')

  const { data: rows, error } = await supabaseAdmin
    .from('pos_customers')
    .select('id, business_id, email, phone, name, notes')
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  console.log('rows fetched:', rows?.length ?? 0)

  let updated = 0, skipped = 0, failed = 0
  for (const r of rows ?? []) {
    if (!r.business_id) { skipped++; continue }
    const enc = encryptCustomerPII(r, r.business_id as string)
    const { error: upErr } = await supabaseAdmin.from('pos_customers').update(enc).eq('id', r.id)
    if (upErr) { failed++; console.error('update failed', r.id, upErr.message) } else { updated++ }
  }
  console.log(JSON.stringify({ updated, skipped, failed }))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
