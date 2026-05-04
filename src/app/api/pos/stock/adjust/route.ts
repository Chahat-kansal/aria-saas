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

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const { product_id, outlet_id, adjustment_qty, reason, adjusted_by, new_qty } = await req.json();
  if (!product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 });

  // If new_qty provided (stocktake), compute delta from current
  let delta = parseFloat(adjustment_qty ?? '0');

  if (new_qty !== undefined) {
    // Stocktake mode: set absolute quantity
    const { data: prod } = await supabase.from('pos_products').select('stock_quantity').eq('id', product_id).maybeSingle();
    const current = prod?.stock_quantity ?? 0;
    delta = parseFloat(new_qty) - current;
    // Update stock directly
    await supabase.from('pos_products').update({ stock_quantity: parseFloat(new_qty) }).eq('id', product_id);
  } else {
    // Adjustment mode: apply delta
    const { data: prod } = await supabase.from('pos_products').select('stock_quantity').eq('id', product_id).maybeSingle();
    const current = prod?.stock_quantity ?? 0;
    await supabase.from('pos_products').update({ stock_quantity: Math.max(0, current + delta) }).eq('id', product_id);
  }

  // Log adjustment (table may not exist yet)
  try {
    await supabase.from('pos_stock_adjustments').insert({
      business_id: bid,
      product_id,
      outlet_id: outlet_id ?? null,
      adjustment_qty: delta,
      reason: reason ?? null,
      adjusted_by: adjusted_by ?? null,
    });
  } catch { /* non-fatal if table doesn't exist */ }

  return NextResponse.json({ ok: true, delta });
}
