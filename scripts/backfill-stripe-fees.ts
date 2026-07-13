// COST-LEDGER-1 — one-shot backfill for Stripe processing fees for the current calendar month.
// The webhook (src/app/api/stripe/webhook/route.ts, charge.succeeded) only captures fees for
// charges that happen AFTER that handler ships (and only once charge.succeeded is enabled on the
// live webhook endpoint config). This script closes the gap for charges already settled this month.
//
// Idempotent: cost_events has a UNIQUE (provider, reference_id) index, so re-running this script
// (or running it after the webhook has already captured some of the same balance_transactions)
// just skips duplicates via a 23505 catch — safe to run more than once.
//
// Usage: npx tsx scripts/backfill-stripe-fees.ts

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function resolveBusinessId(customerId: string | null): Promise<string | null> {
  if (!customerId) return null
  const { data } = await supabaseAdmin
    .from('business_subscriptions')
    .select('business_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return (data?.business_id as string | undefined) ?? null
}

async function main() {
  const now = new Date()
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000)

  let inserted = 0
  let skippedDuplicate = 0
  let skippedNonUsd = 0
  let startingAfter: string | undefined

  for (;;) {
    const page = await stripe.balanceTransactions.list({
      created: { gte: monthStart },
      type: 'charge',
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.source'],
    })

    for (const bt of page.data) {
      if (bt.currency !== 'usd') { skippedNonUsd++; continue }
      const charge = bt.source && typeof bt.source !== 'string' ? (bt.source as Stripe.Charge) : null
      const customerId = charge && typeof charge.customer === 'string' ? charge.customer : (charge?.customer as Stripe.Customer | undefined)?.id ?? null
      const businessId = await resolveBusinessId(customerId)

      const { error } = await supabaseAdmin.from('cost_events').insert({
        category: 'payment_fee',
        provider: 'stripe',
        business_id: businessId,
        reference_id: bt.id,
        amount_usd_cents: bt.fee,
        quantity: 1,
        unit: 'charge',
        metadata: { charge_id: charge?.id ?? null, gross_usd_cents: bt.amount, net_usd_cents: bt.net, fee_details: bt.fee_details, backfilled: true },
      })
      if (error) {
        if (error.code === '23505') skippedDuplicate++
        else console.error(`[backfill-stripe-fees] insert failed for ${bt.id}:`, error.message)
      } else {
        inserted++
      }
    }

    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1].id
  }

  console.log(`[backfill-stripe-fees] done — inserted=${inserted} skipped_duplicate=${skippedDuplicate} skipped_non_usd=${skippedNonUsd}`)
}

main().catch(e => { console.error('[backfill-stripe-fees] fatal:', e); process.exit(1) })
