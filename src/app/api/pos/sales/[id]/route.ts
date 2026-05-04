export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const { data: sale } = await supabase
    .from('pos_sales')
    .select('*, pos_customers(id, name, email, phone, loyalty_points), pos_sale_items(id, product_id, product_name, product_sku, quantity, unit_price, discount_percent, line_total, tax_rate, cost_price, margin_percent)')
    .eq('id', params.id)
    .eq('business_id', bid)
    .maybeSingle();

  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
  return NextResponse.json({ sale });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const body = await req.json();
  // Only allow safe fields to be updated
  const allowed = ['served_by', 'notes', 'customer_id'];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }

  if (!Object.keys(update).length) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });

  const { error } = await supabase.from('pos_sales').update(update).eq('id', params.id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
