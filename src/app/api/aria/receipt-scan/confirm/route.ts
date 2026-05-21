export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, updates } = await req.json();
  if (!business_id || !Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'business_id and updates required' }, { status: 400 });
  }

  const { data: business } = await supabase.from('businesses')
    .select('id, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const dataSource = business.data_source ?? 'aria_pos';
  const table = dataSource === 'square' ? 'square_items' : 'pos_products';
  const stockCol = dataSource === 'square' ? 'current_stock' : 'stock_quantity';

  let updated = 0;
  const movements = [];

  for (const upd of updates) {
    const { item_id, new_stock, quantity_added } = upd;
    if (!item_id || new_stock == null || quantity_added == null) continue;

    const updatePayload: Record<string, unknown> = { [stockCol]: new_stock };
    // Save cost price from invoice if provided
    if (upd.cost_price_aud != null && dataSource === 'aria_pos') {
      updatePayload.cost_price = upd.cost_price_aud;
      updatePayload.cost = upd.cost_price_aud;
    }
    const { error } = await supabase.from(table)
      .update(updatePayload)
      .eq('id', item_id)
      .eq('business_id', business_id);

    if (!error) {
      updated++;
      movements.push({ business_id, item_id, quantity_added, new_stock, movement_type: 'receipt_scan' });
    }
  }

  // Auto-create new products from unmatched lines
  const newProducts = (updates as any[]).filter((u: any) => u.create_new && u.description);
  const createdIds: string[] = [];
  for (const np of newProducts) {
    const sku = `RECV-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const { data: created } = await supabase.from('pos_products').insert({
      business_id,
      name: np.description,
      sku,
      stock_quantity: np.quantity ?? 0,
      cost_price: np.cost_price_aud ?? null,
      cost: np.cost_price_aud ?? null,
      price: 0,
      status: 'draft',
      is_active: false,
      source: 'receipt_scan',
      notes: `Auto-created from receipt scan. Supplier: ${np.supplier_name ?? 'unknown'}`,
    }).select('id').single();
    if (created?.id) {
      createdIds.push(created.id);
      movements.push({ business_id, item_id: created.id, quantity_added: np.quantity ?? 0, new_stock: np.quantity ?? 0, movement_type: 'receipt_scan' });
    }
  }

  if (movements.length > 0) {
    await supabase.from('stock_movements').insert(movements);
  }

  // Log to activity_log
  supabase.from('activity_log').insert({
    business_id,
    action_type: 'receipt_scan',
    description: `Stock-in from receipt scan: ${updated} item${updated !== 1 ? 's' : ''} updated`,
    metadata: { updated_count: updated },
  }).then(() => null, () => null);

  const created = newProducts.length;
  return NextResponse.json({ ok: true, updated, created });
}

export const POST = withErrorCapture('aria/receipt-scan/confirm', _POST)
