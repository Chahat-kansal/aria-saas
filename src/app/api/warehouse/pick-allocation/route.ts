export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { allocateLots, calculatePickShortfall, getDefaultPickingMethod, type PickingMethod } from '@/lib/warehouse-picking';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, item_id, quantity_needed, method } = body;

  if (!business_id || !item_id || !quantity_needed) {
    return NextResponse.json({ error: 'business_id, item_id, quantity_needed required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Get product category to determine default picking method
  const { data: product } = await supabase
    .from('pos_products')
    .select('id, pos_categories(name)')
    .eq('id', item_id)
    .maybeSingle();

  const category = (product as any)?.pos_categories?.name ?? null;
  const methodToUse: PickingMethod = (method as PickingMethod) ?? getDefaultPickingMethod(category);

  // Get active lots for this item with location info
  const { data: lots } = await supabase
    .from('warehouse_lots')
    .select(`
      id, lot_number, quantity_remaining, expiry_date, received_at,
      warehouse_locations!warehouse_lots_location_id_fkey(label)
    `)
    .eq('business_id', business_id)
    .eq('item_id', item_id)
    .eq('status', 'active')
    .gt('quantity_remaining', 0);

  const lotsToConsider = (lots ?? []).map((l: any) => ({
    lot_id: l.id,
    lot_number: l.lot_number,
    quantity_available: l.quantity_remaining ?? 0,
    expiry_date: l.expiry_date ?? null,
    received_at: l.received_at,
    location_label: l.warehouse_locations?.label ?? null,
  }));

  const allocations = allocateLots(lotsToConsider, quantity_needed, methodToUse);
  const total_available = lotsToConsider.reduce((s, l) => s + l.quantity_available, 0);
  const shortfall = calculatePickShortfall(allocations, quantity_needed);

  return NextResponse.json({
    allocations,
    total_available,
    shortfall,
    method_used: methodToUse,
    category,
  });
}
