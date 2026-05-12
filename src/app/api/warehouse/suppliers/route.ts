export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Aggregate from warehouse_supplier_performance
  const [perfRes, posSupplierRes] = await Promise.all([
    supabase.from('warehouse_supplier_performance')
      .select('*')
      .eq('business_id', business_id)
      .order('actual_delivery_date', { ascending: false }),
    supabase.from('pos_suppliers')
      .select('id, name')
      .eq('business_id', business_id),
  ]);

  // Map pos_suppliers by name
  const posSupplierMap: Record<string, string> = {};
  for (const s of posSupplierRes.data ?? []) posSupplierMap[s.name] = s.id;

  const suppMap: Record<string, {
    id: string | null; name: string; total_orders: number; on_time: number;
    total_ordered: number; total_received: number; discrepancies: number;
    lead_days: number[]; last_order: string;
  }> = {};

  for (const p of perfRes.data ?? []) {
    const name = p.supplier_name ?? 'Unknown';
    if (!suppMap[name]) {
      suppMap[name] = {
        id: posSupplierMap[name] ?? null,
        name,
        total_orders: 0, on_time: 0,
        total_ordered: 0, total_received: 0,
        discrepancies: 0, lead_days: [],
        last_order: p.actual_delivery_date ?? p.grn_date ?? '',
      };
    }
    const s = suppMap[name];
    s.total_orders++;
    if (p.on_time_delivery) s.on_time++;
    s.total_ordered += p.quantity_ordered ?? 0;
    s.total_received += p.quantity_received ?? 0;
    const discrepancyCount = Math.abs((p.quantity_ordered ?? 0) - (p.quantity_received ?? 0));
    if (discrepancyCount > 0) s.discrepancies += 1;
    const lastDate = p.actual_delivery_date ?? p.grn_date ?? '';
    if (lastDate > s.last_order) s.last_order = lastDate;
  }

  // Also include pos_suppliers that have no performance records yet
  for (const s of posSupplierRes.data ?? []) {
    if (!suppMap[s.name]) {
      suppMap[s.name] = { id: s.id, name: s.name, total_orders: 0, on_time: 0, total_ordered: 0, total_received: 0, discrepancies: 0, lead_days: [], last_order: '' };
    }
  }

  const suppliers = Object.values(suppMap).map(s => ({
    id: s.id,
    name: s.name,
    total_orders: s.total_orders,
    on_time_pct: s.total_orders > 0 ? Math.round((s.on_time / s.total_orders) * 100) : null,
    fill_rate_pct: s.total_ordered > 0 ? Math.round((s.total_received / s.total_ordered) * 100) : null,
    discrepancies: s.discrepancies,
    avg_lead_days: s.lead_days.length > 0 ? Math.round(s.lead_days.reduce((a, b) => a + b, 0) / s.lead_days.length) : null,
    last_order: s.last_order || '—',
  })).sort((a, b) => b.total_orders - a.total_orders);

  return NextResponse.json({ suppliers });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { business_id, name } = body;
  if (!business_id || !name) return NextResponse.json({ error: 'business_id and name required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: e } = await supabase.from('pos_suppliers')
    .insert({ business_id, name, contact_name: body.contact_name ?? null, email: body.email ?? null, phone: body.phone ?? null, payment_terms: body.payment_terms ?? 'net30', lead_time_days: body.lead_time_days ?? null, minimum_order_cents: body.minimum_order_cents ?? null, is_active: true })
    .select()
    .single();

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ supplier: data });
}

export const GET = withErrorCapture('warehouse/suppliers', _GET)
export const POST = withErrorCapture('warehouse/suppliers', _POST)
