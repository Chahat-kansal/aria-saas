export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { outlet_id, items } = await req.json();

  const variances = (items as Array<{ product_id: string; system_qty: number; counted_qty: number; recount_count: number }>).filter(i => i.counted_qty !== i.system_qty);

  const { data: stockTake } = await supabase.from('pos_stock_takes').insert({
    business_id: bid, outlet_id, started_by: user.id, started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(), status: 'committed',
    items_counted: items.length, items_with_variance: variances.length,
    total_variance_cents: variances.reduce((s: number, i: any) => s + Math.abs(i.counted_qty - i.system_qty), 0),
  }).select('id').single();

  if (stockTake?.id) {
    await supabase.from('pos_stock_take_items').insert(
      (items as any[]).map(i => ({ stock_take_id: stockTake.id, product_id: i.product_id, system_qty: i.system_qty, counted_qty: i.counted_qty, recount_count: i.recount_count ?? 0 }))
    );

    // Apply inventory adjustments
    for (const item of variances as any[]) {
      await supabase.from('pos_products').update({ stock_quantity: item.counted_qty }).eq('id', item.product_id).eq('business_id', bid);
    }
  }

  return NextResponse.json({ success: true, stock_take_id: stockTake?.id });
}

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ stock_takes: [] });
  const { data } = await supabase.from('pos_stock_takes').select('*').eq('business_id', bid).order('started_at', { ascending: false }).limit(50);
  return NextResponse.json({ stock_takes: data ?? [] });
}
