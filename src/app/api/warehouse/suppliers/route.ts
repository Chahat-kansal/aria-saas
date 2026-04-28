export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Aggregate from warehouse_supplier_performance
  const { data: perf } = await supabase
    .from('warehouse_supplier_performance')
    .select('*')
    .eq('business_id', business_id)
    .order('grn_date', { ascending: false });

  // Group by supplier
  const suppMap: Record<string, {
    name: string; total_orders: number; on_time: number; total_items: number;
    total_received: number; discrepancies: number; avg_lead_days: number[]; last_order: string;
  }> = {};

  for (const p of perf ?? []) {
    if (!suppMap[p.supplier_name]) {
      suppMap[p.supplier_name] = { name: p.supplier_name, total_orders: 0, on_time: 0, total_items: 0, total_received: 0, discrepancies: 0, avg_lead_days: [], last_order: p.grn_date };
    }
    const s = suppMap[p.supplier_name];
    s.total_orders++;
    if (p.on_time_delivery) s.on_time++;
    s.total_items += p.items_ordered ?? 0;
    s.total_received += p.items_received ?? 0;
    if (p.discrepancy_count) s.discrepancies += p.discrepancy_count;
    if (p.lead_time_days) s.avg_lead_days.push(p.lead_time_days);
    if (p.grn_date > s.last_order) s.last_order = p.grn_date;
  }

  const suppliers = Object.values(suppMap).map(s => ({
    name: s.name,
    total_orders: s.total_orders,
    on_time_pct: s.total_orders ? Math.round((s.on_time / s.total_orders) * 100) : null,
    fill_rate_pct: s.total_items ? Math.round((s.total_received / s.total_items) * 100) : null,
    discrepancies: s.discrepancies,
    avg_lead_days: s.avg_lead_days.length ? Math.round(s.avg_lead_days.reduce((a, b) => a + b, 0) / s.avg_lead_days.length) : null,
    last_order: s.last_order,
  })).sort((a, b) => b.total_orders - a.total_orders);

  return NextResponse.json({ suppliers });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (!await verifyBiz(supabase, user.id, body.business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error: e } = await supabase.from('warehouse_supplier_performance').insert({ ...body }).select().single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ record: data });
}
