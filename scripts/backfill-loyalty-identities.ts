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
 * ARIA-LOYALTY-BACKFILL-RUN — rows with NO usable contact are now SKIPPED rather than linked, and
 * written to scripts/out/backfill-skipped.json (gitignored: it carries names, phones and emails).
 * See linkability() below for why an unusable phone is a skip and not a link.
 *
 * PER-ROW ISOLATION: the helper never throws, and each row is handled independently, so one bad
 * record cannot abort the run.
 *
 * DOES NOT TOUCH POINT BALANCES. This links identities. The seeded balances were already
 * reconciled to the ledger in ARIA-LOYALTY-FIX-1 and are not read or written here.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { linkLoyaltyIdentity } from '../src/lib/loyalty/link-identity'
import { toE164AU } from '../src/lib/phone'

const EXECUTE = process.argv.includes('--execute')
const SKIP_LIST = join('scripts', 'out', 'backfill-skipped.json')

/**
 * ARIA-LOYALTY-BACKFILL-RUN §2 — is this row linkable at all?
 *
 * A row is linkable if it has a usable email, OR a phone that resolves to canonical AU E.164.
 *
 * WHY AN UNUSABLE PHONE IS A SKIP AND NOT A LINK: minting an identity keyed on `234567u8io` creates
 * a row that LOOKS linked and is a dead end — enrolment now rejects such numbers outright, so it
 * can never match a future sign-up. A visible gap is better than an invisible one.
 *
 * WHY WE DO NOT NULL THE PHONE: the raw string is the only record of what the customer actually
 * typed, and it is the one thing that lets an owner correct it later. Skipping preserves it.
 *
 * NOTE the two cases are independent: an unusable phone WITH a valid email is still linkable BY
 * EMAIL, and is processed rather than skipped.
 */
function linkability(email: string | null, phone: string | null): { linkable: boolean; reason: string } {
  const hasEmail = Boolean((email ?? '').trim())
  const canonicalPhone = toE164AU(phone)
  if (hasEmail) return { linkable: true, reason: canonicalPhone ? 'email+phone' : 'email only (phone unusable or absent)' }
  if (canonicalPhone) return { linkable: true, reason: 'phone only' }
  return {
    linkable: false,
    reason: (phone ?? '').trim() ? 'phone unusable and no email' : 'no phone and no email',
  }
}

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

  const tally = { linked_new: 0, linked_existing: 0, identity_taken: 0, skipped: 0, failed: 0 }
  const skipped: Array<{ id: string; name: string; raw_phone: string | null; email: string | null; reason: string }> = []
  // Rows the unique index refused because this person already has a live customer row here. A
  // merge task for the owner, kept separate from `skipped` because the fix is different: skipped
  // rows need a corrected phone number, these need two records merged.
  const duplicates: Array<{ id: string; name: string; identity_id: string; held_by: string | null }> = []

  for (const c of customers) {
    const label = `${String(c.name ?? '(no name)').slice(0, 28).padEnd(28)} ${String(c.id).slice(0, 8)}`
    const email = (c.email as string | null) ?? null
    const rawPhone = (c.phone as string | null) ?? null
    const { linkable, reason } = linkability(email, rawPhone)

    if (!linkable) {
      tally.skipped++
      skipped.push({ id: String(c.id), name: String(c.name ?? ''), raw_phone: rawPhone, email, reason })
      console.log(`  SKIP     ${label}  raw_phone=${JSON.stringify(rawPhone)}  (${reason})`)
      continue
    }

    if (!EXECUTE) {
      console.log(`  WOULD    ${label}  (${reason})`)
      continue
    }

    // Phone is passed CANONICALISED when it resolves, null when it does not. The till stores
    // `toE164AU(phone) ?? phone`, so for every usable number the two agree — a backfilled identity
    // matches what a future till entry for the same person would look up. Passing an unusable raw
    // value cannot happen here: those rows were skipped above.
    const out = await linkLoyaltyIdentity(db, {
      customerId: c.id as string,
      email,
      phone: toE164AU(rawPhone),
    })

    if (out.reason === 'linked') {
      if (out.created) { tally.linked_new++; console.log(`  CREATED  ${label}  -> ${out.identityId}`) }
      else { tally.linked_existing++; console.log(`  MATCHED  ${label}  -> ${out.identityId}`) }
    } else if (out.reason === 'identity_taken') {
      // ARIA-LOYALTY-CLOSEOUT-1 §1 — pos_customers_identity_uniq refused the link: another LIVE
      // customer row in this business already holds the identity for this person's phone/email.
      //
      // This is a DUPLICATE CUSTOMER the backfill has surfaced, not a backfill failure, and it is
      // the owner's call to merge — /api/customers/merge exists for exactly this and soft-deletes
      // the loser, which then frees the identity. Not merged automatically: choosing which of two
      // real customer records survives is not a decision a batch script should make silently.
      //
      // BEFORE THIS SPRINT this row would have printed MATCHED and been counted as linked_existing,
      // because the helper discarded the update's error and returned {reason:'linked'} with a real
      // identityId. The run would have reported 42 links and delivered fewer, with nothing to show
      // which ones — the whole reason the outcome is now distinct.
      tally.identity_taken++
      duplicates.push({ id: String(c.id), name: String(c.name ?? ''), identity_id: out.identityId, held_by: out.heldByCustomerId })
      console.log(`  DUPLICATE ${label}  identity ${out.identityId} already held by ${out.heldByCustomerId ?? '(unknown row)'}`)
    } else if (out.reason === 'no_contact') {
      // Unreachable given the linkability gate above; kept so a future change to either side is loud.
      tally.skipped++
      skipped.push({ id: String(c.id), name: String(c.name ?? ''), raw_phone: rawPhone, email, reason: 'helper reported no_contact' })
      console.log(`  SKIP     ${label}  (helper: no_contact)`)
    } else {
      tally.failed++; console.log(`  FAILED   ${label}`)
    }
  }

  // The skip list must survive the run — a console line scrolls away, and these rows are a task
  // for the owner (a customer whose phone number needs correcting), not just a statistic.
  try {
    mkdirSync(join('scripts', 'out'), { recursive: true })
    writeFileSync(SKIP_LIST, JSON.stringify({ generated_at: new Date().toISOString(), mode: EXECUTE ? 'execute' : 'dry-run', skipped, duplicates }, null, 2))
    console.log(`\nskip list written: ${SKIP_LIST} (${skipped.length} skipped, ${duplicates.length} duplicates)`)
  } catch (e) {
    console.error('could not write skip list:', (e as Error).message)
  }

  console.log('\nresult:', JSON.stringify(tally))
  if (EXECUTE) {
    const { count } = await db
      .from('pos_customers')
      .select('id', { count: 'exact', head: true })
      .is('loyalty_identity_id', null)
    // Every row that did NOT get linked is still unlinked, and there are now three ways that
    // happens. Naming all three keeps this an actual reconciliation rather than a number to nod at:
    // a mismatch means a row was neither linked nor accounted for.
    const unaccounted = tally.skipped + tally.identity_taken + tally.failed
    console.log(`still unlinked after run: ${count ?? '?'}  (expected ${unaccounted} = skipped ${tally.skipped} + identity_taken ${tally.identity_taken} + failed ${tally.failed})`)
    if (typeof count === 'number' && count !== unaccounted) {
      console.error(`  MISMATCH: ${count} unlinked rows vs ${unaccounted} accounted for. Investigate before re-running.`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
