import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const date = searchParams.get('date');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let query = supabase.from('warehouse_grns').select('*').eq('business_id', business_id).order('received_at', { ascending: false });
  if (date) query = query.gte('received_at', `${date}T00:00:00`).lte('received_at', `${date}T23:59:59`);

  const { data } = await query.limit(50);
  return NextResponse.json({ grns: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { business_id, purchase_order_id, supplier_id, supplier_name, received_by, invoice_number, invoice_total_cents, notes, items } = body;

  if (!business_id || !items?.length) return NextResponse.json({ error: 'business_id and items required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Generate GRN number
  const { count } = await supabase.from('warehouse_grns').select('id', { count: 'exact', head: true }).eq('business_id', business_id);
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const grnNumber = `GRN-${today}-${String((count ?? 0) + 1).padStart(3, '0')}`;

  // Detect discrepancies
  let hasDiscrepancy = false;
  for (const item of items) {
    if (item.condition && item.condition !== 'Good') hasDiscrepancy = true;
    if (item.po_expected_qty && item.quantity_received !== item.po_expected_qty) hasDiscrepancy = true;
  }

  // Create GRN record
  const { data: grn, error: grnErr } = await supabase.from('warehouse_grns').insert({
    business_id, grn_number: grnNumber,
    purchase_order_id: purchase_order_id ?? null,
    supplier_id: supplier_id ?? null, supplier_name: supplier_name ?? null,
    received_by: received_by ?? null,
    invoice_number: invoice_number ?? null, invoice_total_cents: invoice_total_cents ?? null,
    notes: notes ?? null,
    status: hasDiscrepancy ? 'discrepancy' : 'confirmed',
    items,
    received_at: new Date().toISOString(),
  }).select().single();

  if (grnErr || !grn) return NextResponse.json({ error: grnErr?.message ?? 'Failed to create GRN' }, { status: 500 });

  // Process each line item
  const stockTable = biz.data_source === 'square' ? 'square_items' : 'pos_products';
  const stockCol = biz.data_source === 'square' ? 'current_stock' : 'stock_quantity';

  for (const item of items) {
    const qty = item.quantity_received ?? 0;
    if (qty <= 0) continue;

    // Auto-generate lot number if not provided
    const lotNum = item.lot_number?.trim() || `${today}-${(supplier_name ?? 'XX').substring(0, 2).toUpperCase()}-${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`;

    // Create lot record
    await supabase.from('warehouse_lots').insert({
      business_id, item_id: item.item_id, item_name: item.item_name,
      lot_number: lotNum, supplier_id: supplier_id ?? null, supplier_name: supplier_name ?? null,
      quantity_received: qty, quantity_remaining: qty,
      unit_cost_cents: item.unit_cost_cents ?? null,
      expiry_date: item.expiry_date ?? null,
      notes: item.notes ?? null,
      status: 'active',
    }).then(() => null, () => null); // non-blocking

    // Update stock
    const { data: prod } = await supabase.from(stockTable).select(stockCol).eq('id', item.item_id).eq('business_id', business_id).single();
    if (prod) {
      const current = (prod as any)[stockCol] ?? 0;
      await supabase.from(stockTable).update({ [stockCol]: current + qty }).eq('id', item.item_id).eq('business_id', business_id);
    }

    // Stock movement
    await supabase.from('stock_movements').insert({
      business_id, item_id: item.item_id, movement_type: 'grn_receipt',
      quantity_added: qty, new_stock: ((prod as any)?.[stockCol] ?? 0) + qty,
      notes: `GRN ${grnNumber}`,
    }).then(() => null, () => null);

    // Assign location
    if (item.location_id) {
      await supabase.from('warehouse_item_locations').upsert({
        business_id, item_id: item.item_id, location_id: item.location_id, is_primary: true,
      }, { onConflict: 'business_id,item_id,location_id' }).then(() => null, () => null);
    }
  }

  // Update PO status if linked
  if (purchase_order_id) {
    await supabase.from('pos_purchase_orders').update({ status: hasDiscrepancy ? 'partial' : 'received' }).eq('id', purchase_order_id).then(() => null, () => null);
  }

  // Supplier performance record
  if (supplier_id || supplier_name) {
    await supabase.from('warehouse_supplier_performance').insert({
      business_id, supplier_id: supplier_id ?? null, supplier_name: supplier_name ?? null,
      grn_id: grn.id,
      quantity_received: items.reduce((s: number, i: any) => s + (i.quantity_received ?? 0), 0),
      invoice_total_cents: invoice_total_cents ?? null,
      actual_delivery_date: new Date().toISOString().split('T')[0],
    }).then(() => null, () => null);
  }

  return NextResponse.json({ ok: true, grn_id: grn.id, grn_number: grnNumber, has_discrepancy: hasDiscrepancy });
}
