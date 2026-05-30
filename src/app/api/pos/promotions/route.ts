export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (data?.id) {
    console.warn('[getBid] No user_active_business row, falling back to oldest active business', { userId, fallback_business_id: data.id });
  }
  return data?.id ?? null;
}

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

function normPromoPayload(body: Record<string, unknown>, bid?: string): Record<string, unknown> {
  const rawType = String(body.promotion_type ?? body.discount_type ?? body.type ?? 'percent_off')
  const promotion_type = PROMO_TYPE_MAP[rawType] ?? rawType
  const p: Record<string, unknown> = { ...body, promotion_type }
  if (bid) p.business_id = bid
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
  return p
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
