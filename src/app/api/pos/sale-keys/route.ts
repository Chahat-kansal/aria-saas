export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBid } from '@/lib/auth/get-bid'

// H-17 — POST/PATCH used to spread the whole request body directly into the DB write, so a
// client could set any column verbatim (business_id override, etc). Explicit allowlist matching
// pos_sale_keys' real live columns, verified via information_schema against prod (the
// 20260510000008_shopfront_parity.sql migration's CREATE TABLE column list — colour,
// custom_price_cents, action, is_active — does NOT match what's actually live; the table was
// evidently created earlier by something else and that migration's IF NOT EXISTS was a no-op).
// business_id/id/created_at are never client-settable.
const SALE_KEY_FIELDS = ['label', 'type', 'color', 'icon', 'product_id', 'category_id', 'function_name', 'position', 'category_tab', 'display_order', 'color_token'] as const
function pickSaleKeyFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of SALE_KEY_FIELDS) if (f in body) out[f] = body[f]
  return out
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
  const { data: sale_key, error } = await supabase.from('pos_sale_keys').insert({ ...pickSaleKeyFields(body), business_id: bid }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sale_key });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { error } = await supabase.from('pos_sale_keys').update(pickSaleKeyFields(body)).eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('pos_sale_keys').delete().eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const POST = withErrorCapture('pos/sale-keys', _POST)
export const PATCH = withErrorCapture('pos/sale-keys', _PATCH)
export const DELETE = withErrorCapture('pos/sale-keys', _DELETE)
