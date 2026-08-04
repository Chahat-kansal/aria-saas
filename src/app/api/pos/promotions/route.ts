export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBid } from '@/lib/auth/get-bid'

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ promotions: [] });
  try {
    const { data, error } = await supabase
      .from('pos_promotions')
      .select('*')
      .eq('business_id', bid)
      .order('created_at', { ascending: false });
    if (error) {
      // Table may not exist yet — return empty gracefully
      if (error.code === '42P01') return NextResponse.json({ promotions: [], table_missing: true });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ promotions: data ?? [] });
  } catch {
    return NextResponse.json({ promotions: [] });
  }
}

const PROMO_TYPE_MAP: Record<string, string> = {
  percent: 'percent_off',
  percentage_discount: 'percent_off',
  fixed: 'amount_off',
  fixed_discount: 'amount_off',
  multibuy: 'bogo',
}

// H-17 — this used to spread {...body} straight into the insert/update, so any client-supplied
// key rode along untouched. Explicit allowlist of pos_promotions' real live columns, verified via
// information_schema against prod (the base 20260430000001_pos_promotions.sql CREATE TABLE is
// missing many columns added by later migrations — receipt/waste-elimination/loyalty-offers/
// idempotency-key sprints — so that file alone is not the full picture). 'type' and 'is_active'
// are deliberately excluded: the alias logic below always folds them into promotion_type/active
// and deletes the raw keys, matching this function's pre-existing behaviour.
const PROMO_FIELDS = [
  'name', 'value', 'min_quantity', 'applies_to', 'category_id', 'product_id',
  'valid_from', 'valid_until', 'active', 'promotion_type', 'product_ids', 'category_ids',
  'buy_quantity', 'get_quantity', 'discount_amount', 'discount_percent', 'bundle_price',
  'min_spend', 'starts_at', 'ends_at', 'notes', 'discount_type', 'active_days',
  'active_hour_start', 'active_hour_end', 'requires_code', 'max_uses_per_day',
  'max_uses_per_customer', 'stacks_with_others', 'stack_priority', 'customer_group_id',
  'min_customer_lifetime_spend', 'min_customer_visits', 'max_total_uses', 'current_uses',
  'exclude_discounted', 'idempotency_key',
  // S-PROMO-RULE-1 — MUST be listed here. PROMO_FIELDS is a strict allowlist applied right
  // before the DB write, so an omitted column is dropped SILENTLY: the owner sets "Cold day,
  // 10°C", the form saves happily, and the rule simply never persists.
  'trigger_type', 'trigger_config',
] as const

function normPromoPayload(body: Record<string, unknown>, bid?: string): Record<string, unknown> {
  const rawType = String(body.promotion_type ?? body.discount_type ?? body.type ?? 'percent_off')
  const promotion_type = PROMO_TYPE_MAP[rawType] ?? rawType
  const p: Record<string, unknown> = { ...body, promotion_type }
  // cleanup legacy keys
  delete p.type; delete p.discount_type; delete p.is_active
  if (body.is_active !== undefined && p.active === undefined) p.active = body.is_active
  // field aliases
  if (body.stackable !== undefined) { if (p.stacks_with_others === undefined) p.stacks_with_others = body.stackable; delete p.stackable }
  if (body.max_uses !== undefined) { if (p.max_total_uses === undefined) p.max_total_uses = body.max_uses; delete p.max_uses }
  if (body.uses_count !== undefined) { if (p.current_uses === undefined) p.current_uses = body.uses_count; delete p.uses_count }
  if (body.start_at !== undefined) { if (p.starts_at === undefined) p.starts_at = body.start_at; delete p.start_at }
  if (body.end_at !== undefined) { if (p.ends_at === undefined) p.ends_at = body.end_at; delete p.end_at }
  // unpack conditions object { min_spend, min_qty, customer_segment }
  if (body.conditions && typeof body.conditions === 'object') {
    const c = body.conditions as Record<string, unknown>
    if (c.min_spend != null && p.min_spend === undefined) p.min_spend = c.min_spend
    if (c.min_qty != null && p.buy_quantity === undefined) p.buy_quantity = c.min_qty
    if (c.customer_segment != null && p.customer_group_id === undefined) p.customer_group_id = c.customer_segment
    delete p.conditions
  }
  // SECURITY: allowlist to pos_promotions' real columns only — everything built above still
  // originates from a {...body} spread, so unrecognized/malicious keys must be dropped here,
  // right before the value is handed to the DB write.
  const out: Record<string, unknown> = {}
  for (const f of PROMO_FIELDS) if (f in p) out[f] = p[f]
  if (bid) out.business_id = bid
  return out
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  try {
    const body = await req.json();
    const payload = normPromoPayload(body as Record<string, unknown>, bid)
    const { data, error } = await supabase.from('pos_promotions').insert(payload).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ promotion: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const raw = await req.json();
    const body = normPromoPayload(raw as Record<string, unknown>)
    delete body.business_id
    const { error } = await supabase.from('pos_promotions').update(body).eq('id', id).eq('business_id', bid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabase.from('pos_promotions').delete().eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/promotions', _GET)
export const POST = withErrorCapture('pos/promotions', _POST)
export const PATCH = withErrorCapture('pos/promotions', _PATCH)
export const DELETE = withErrorCapture('pos/promotions', _DELETE)
