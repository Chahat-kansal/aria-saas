export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const grn_id = searchParams.get('grn_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let q = supabase.from('warehouse_landed_costs').select('*').eq('business_id', business_id).order('created_at', { ascending: false });
  if (grn_id) q = q.eq('grn_id', grn_id);
  const { data } = await q.limit(100);
  return NextResponse.json({ landed_costs: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, grn_id, cost_type, description, amount_cents, allocation_method = 'value', grn_items } = body;

  if (!business_id || !grn_id || !cost_type || !amount_cents) {
    return NextResponse.json({ error: 'business_id, grn_id, cost_type, amount_cents required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Calculate allocations
  const items: Array<{ item_id: string; item_name: string; invoice_cost_cents: number; quantity: number }> = grn_items ?? [];
  const totalValue = items.reduce((s, i) => s + (i.invoice_cost_cents * i.quantity), 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const allocated_to_items = items.map(item => {
    let allocated_cents = 0;
    if (allocation_method === 'value' && totalValue > 0) {
      allocated_cents = Math.round(amount_cents * (item.invoice_cost_cents * item.quantity / totalValue));
    } else if (allocation_method === 'quantity' && totalQty > 0) {
      allocated_cents = Math.round(amount_cents * (item.quantity / totalQty));
    }
    const new_unit_cost_cents = item.quantity > 0
      ? Math.round((item.invoice_cost_cents * item.quantity + allocated_cents) / item.quantity)
      : item.invoice_cost_cents;

    return { item_id: item.item_id, item_name: item.item_name, allocated_cents, new_unit_cost_cents };
  });

  const { data, error } = await supabase.from('warehouse_landed_costs').insert({
    business_id, grn_id, cost_type, description: description ?? null,
    amount_cents, allocation_method, allocated_to_items,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ landed_cost: data, allocated_to_items }, { status: 201 });
}

export const GET = withErrorCapture('warehouse/landed-costs', _GET)
export const POST = withErrorCapture('warehouse/landed-costs', _POST)
