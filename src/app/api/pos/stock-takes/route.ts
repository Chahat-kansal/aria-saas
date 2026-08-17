export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { openStocktake, countStocktakeLine, submitStocktake } from '@/lib/inventory/stocktake'
import { planStocktakePost } from '@/lib/inventory/stocktake-post'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

// INV-BASELINE-1 PHASE 1 — THIS ROUTE NO LONGER COUNTS. IT DELEGATES.
//
// What it used to do, and why that had to end: it inserted its own header, inserted its own lines,
// and then OVERWROTE book stock straight from the count —
//
//   pos_products.update({ stock_quantity: counted_qty })
//   pos_outlet_inventory.upsert({ items_on_hand: counted_qty, last_counted_at: now })
//
// — with no owner review, no attributed pos_stock_adjustments row and no stock_movements row, while
// lib/inventory/stocktake.ts and lib/inventory/count.ts BOTH document the opposite as locked:
// "a count NEVER mutates items_on_hand … silent auto-correction is forbidden". Two live paths, one
// table, opposite contracts (INV-BASELINE-PREFLIGHT §Q1). The engine wins; this route is now one of
// its callers rather than a second implementation.
//
// THREE DEFECTS DIE WITH THE OLD BODY, all recorded in the preflight:
//  1. total_variance_cents summed |counted − system| — a QUANTITY — into a cents column with no cost
//     lookup (RULE 6). The engine computes it from resolveCostFor, and phase 3 makes "no cost known"
//     render as unknown rather than as a number.
//  2. upsert onConflict was 'product_id,outlet_id'; the live unique index is
//     (business_id, product_id, outlet_id).
//  3. Not one write checked its error, and the upsert ended `.then(() => null)`, discarding the
//     result outright (RULE 7).
//
// AND A FOURTH THAT WAS NOT IN THE PREFLIGHT — found while converting, live and destructive:
// dashboard/stocktake/page.tsx posts a DIFFERENT body shape ({ business_id, name, items:[{ product_id,
// product_name, expected_qty, counted_qty: null }] }, no outlet_id). Against the old code
// `null !== undefined` made EVERY item a "variance", so the loop ran
// `pos_products.update({ stock_quantity: null })` for every tracked product in the business —
// pos_products.stock_quantity is NULLABLE, so that update SUCCEEDS. The paired
// pos_outlet_inventory upsert failed harmlessly (outlet_id is NOT NULL) and its error was swallowed.
// Net effect: opening a stocktake from the dashboard silently wiped every product's stock_quantity.
// Delegating removes it — the engine derives system_qty server-side from live items_on_hand and
// never writes pos_products at all.
//
// BOTH CALLER SHAPES ARE STILL ACCEPTED (RULE 0 — neither surface changes):
//   • pos/inventory/stocktake/new  sends counted lines  → open, count each, submit
//   • dashboard/stocktake          sends counted_qty:null → open only, session left in_progress
async function _POST(req: Request, _ctx: unknown, { supabase, userId, businessId: bid }: BusinessContext) {
  const plan = planStocktakePost(await req.json().catch(() => ({})));

  // openStocktake resolves the outlet itself when none is supplied (the dashboard sends none), and
  // RESUMES the one in_progress session for this outlet+type rather than minting a second — that is
  // what uq_stock_takes_one_open_per_outlet enforces, so repeated posts are idempotent, not duplicates.
  const session = await openStocktake(supabase, bid, plan.outletId, 'full', userId);
  if (!session) {
    return NextResponse.json({ error: 'No outlet configured for this business' }, { status: 400 });
  }

  // No counts in the payload → this was "create a session", not "commit a count". Leave it
  // in_progress; committing an empty session would file a completed stocktake that counted nothing.
  if (plan.action === 'open_only') {
    return NextResponse.json({ success: true, stock_take_id: session.id, status: session.status, lines_recorded: 0 });
  }

  let linesRecorded = 0;
  for (const line of plan.linesToCount) {
    const recorded = await countStocktakeLine(supabase, bid, session.id, line.product_id, line.counted_qty, userId);
    if (recorded) linesRecorded++;
  }

  // 'Owner' rather than a staff name: this route is reached from the owner's dashboard and POS
  // surfaces via withBusinessContext (an authenticated owner session), not from the staff-PIN app.
  // started_by carries the auth user id, exactly as it did before this change.
  const result = await submitStocktake(supabase, bid, session.id, userId, 'Owner');

  return NextResponse.json({
    success: true,
    stock_take_id: session.id,
    lines_recorded: linesRecorded,
    variances: result?.variances ?? 0,
    reviews_raised: result?.reviews_raised ?? 0,
  });
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ stock_takes: [] });
  const { data } = await supabase.from('pos_stock_takes').select('*').eq('business_id', bid).order('started_at', { ascending: false }).limit(50);
  return NextResponse.json({ stock_takes: data ?? [] });
}

export const GET = withErrorCapture('pos/stock-takes', _GET)
export const POST = withBusinessContext('pos/stock-takes', _POST)
