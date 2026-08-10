/**
 * ARIA-LOYALTY-FIX-2 §1 — give every existing pos_customers row without a loyalty_identity_id
 * an identity.
 *
 * USES lib/loyalty/link-identity.ts — the SAME find-or-create the till and the enrol route call.
 * That is the whole point: a SQL backfill replicating the logic would be a second implementation,
 * and the two would drift the first time the matching rules change.
 *
 * RUN:  npx tsx scripts/backfill-loyalty-identities.ts            # dry run, writes nothing
 *       npx tsx scripts/backfill-loyalty-identities.ts --execute  # performs the backfill
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 *
 * IDEMPOTENT twice over: it only selects rows where loyalty_identity_id IS NULL, and the helper
 * itself finds-before-inserting. Running it twice links nothing new and mints no second identity.
 *
 * PER-ROW ISOLATION: the helper never throws, and each row is handled independently, so one bad
 * record cannot abort the run.
 *
 * DOES NOT TOUCH POINT BALANCES. This links identities. The seeded balances were already
 * reconciled to the ledger in ARIA-LOYALTY-FIX-1 and are not read or written here.
 */
import { createClient } from '@supabase/supabase-js'
import { linkLoyaltyIdentity } from '../src/lib/loyalty/link-identity'

const EXECUTE = process.argv.includes('--execute')

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const db = createClient(url, key)

  const { data: rows, error } = await db
    .from('pos_customers')
    .select('id, business_id, name, email, phone')
    .is('loyalty_identity_id', null)
    .order('created_at', { ascending: true })

  if (error) { console.error('select failed:', error.message); process.exit(1) }
  const customers = rows ?? []
  console.log(`unlinked customers: ${customers.length}`)
  console.log(EXECUTE ? '--- EXECUTING ---' : '--- DRY RUN (no writes) — pass --execute to apply ---')

  const tally = { linked_new: 0, linked_existing: 0, no_contact: 0, failed: 0 }

  for (const c of customers) {
    const label = `${String(c.name ?? '(no name)').slice(0, 28).padEnd(28)} ${String(c.id).slice(0, 8)}`

    if (!EXECUTE) {
      const hasContact = Boolean((c.email ?? '').trim() || (c.phone ?? '').trim())
      if (!hasContact) { tally.no_contact++; console.log(`  SKIP     ${label}  (no phone or email)`) }
      else { console.log(`  WOULD    ${label}  ${c.email ?? c.phone}`) }
      continue
    }

    // Phone is passed AS STORED, deliberately: that is exactly what the till path passes
    // (pos/customers hands the helper its already-normalised e164Phone), so a backfilled identity
    // matches what a future till entry for the same person would look up.
    const out = await linkLoyaltyIdentity(db, {
      customerId: c.id as string,
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
    })

    if (out.reason === 'linked') {
      if (out.created) { tally.linked_new++; console.log(`  CREATED  ${label}  -> ${out.identityId}`) }
      else { tally.linked_existing++; console.log(`  MATCHED  ${label}  -> ${out.identityId}`) }
    } else if (out.reason === 'no_contact') {
      tally.no_contact++; console.log(`  SKIP     ${label}  (no phone or email)`)
    } else {
      tally.failed++; console.log(`  FAILED   ${label}`)
    }
  }

  console.log('\nresult:', JSON.stringify(tally))
  if (EXECUTE) {
    const { count } = await db
      .from('pos_customers')
      .select('id', { count: 'exact', head: true })
      .is('loyalty_identity_id', null)
    console.log(`still unlinked after run: ${count ?? '?'}  (expected 0 unless some rows have no contact details)`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
