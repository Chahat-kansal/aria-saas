export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { mergeErrorResponse } from '@/lib/customers/merge-errors'

// ARIA-MERGE-FIX-1 — this route used to destroy the record it was asked to consolidate.
//
// It issued five unrelated writes over PostgREST and checked none of their errors. The fatal pair:
//
//   :42  update pos_customers set ..., phone = primary.phone ?? secondary.phone   where id = primary
//   :61  update pos_customers set deleted_at = now()                              where id = secondary
//
// With a sparse primary — the NORMAL case, since consolidating a thin duplicate into a rich record
// is the whole point — :42 copied the secondary's phone onto the primary while the secondary was
// STILL LIVE. pos_customers_phone_uniq rejected it with 23505, the error was discarded, and :61
// soft-deleted the secondary regardless. Merged totals, points, phone, email, notes and tags were
// never written and the row holding them was gone. The caller got a 200 and the merged record it
// asked for was silently the unchanged primary.
//
// The whole merge now lives in merge_pos_customers_atomic (migration 20260817000001), for two
// reasons that TypeScript cannot provide:
//   - ATOMICITY. Five PostgREST calls cannot share a transaction; supabase-js has no BEGIN. A
//     failure part-way through left the customer WORSE than before — sales repointed to a primary
//     that never got the totals. The function body is one transaction: all of it, or none of it.
//   - ORDERING UNDER A LOCK. The secondary is soft-deleted FIRST so it leaves every partial unique
//     index predicated on deleted_at IS NULL, and both rows are held FOR UPDATE so a sale landing
//     mid-merge cannot be overwritten by a stale maximum computed in JavaScript.
//
// What stays HERE is authorization: the caller's own session client proves they own the business
// before the service-role key is used for anything. That check must not move into the function.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { primary_id, secondary_id, business_id } = body
  if (!primary_id || !secondary_id || !business_id) {
    return NextResponse.json({ error: 'primary_id, secondary_id, business_id required' }, { status: 400 })
  }
  if (primary_id === secondary_id) return NextResponse.json({ error: 'Cannot merge a customer with itself' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Every merged-value rule from the original is preserved verbatim inside the function — max of
  // spend/visits/points, coalesce for email/phone/birthday/square, newline-joined notes, ordered
  // tag union, latest of the four visit timestamps, both the *_spent and *_spend spellings, both
  // loyalty_points and points_balance. See the migration for the line-by-line mapping.
  const { data: merged, error: mergeErr } = await supabaseAdmin.rpc('merge_pos_customers_atomic', {
    p_business_id: business_id,
    p_primary_id: primary_id,
    p_secondary_id: secondary_id,
    p_performed_by: user.id,
  })

  // THE LINE WHOSE ABSENCE WAS THE BUG. On any error the transaction has already rolled back, so
  // both customers are intact and reporting failure is the truth rather than a partial success.
  const failure = mergeErrorResponse(mergeErr)
  if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status })

  // Defensive: a merge that returns no row wrote nothing worth reporting as success.
  if (!merged) return NextResponse.json({ error: 'Merge failed' }, { status: 500 })

  return NextResponse.json({ merged })
}

export const POST = withErrorCapture('customers/merge', _POST)
