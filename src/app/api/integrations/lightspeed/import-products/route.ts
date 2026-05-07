export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, lightspeed_account_id, lightspeed_token } = await req.json();
  if (!business_id || !lightspeed_account_id || !lightspeed_token) {
    return NextResponse.json({ error: 'business_id, lightspeed_account_id, lightspeed_token required' }, { status: 400 });
  }

  // Verify ownership
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const lsHeaders = {
    'Authorization': `Bearer ${lightspeed_token}`,
    'Content-Type': 'application/json',
  };

  // Test connectivity
  const pingRes = await fetch(
    `https://api.lightspeedapp.com/API/Account/${lightspeed_account_id}.json`,
    { headers: lsHeaders }
  );
  if (!pingRes.ok) {
    return NextResponse.json({ error: 'Cannot connect to Lightspeed. Check your Account ID and API token.' }, { status: 400 });
  }

  // Fetch all items (paginated via offset)
  const allItems: any[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(
      `https://api.lightspeedapp.com/API/Account/${lightspeed_account_id}/Item.json` +
      `?limit=${limit}&offset=${offset}&load_relations=["Category","ItemInventories","Prices"]`,
      { headers: lsHeaders }
    );
    if (!res.ok) break;
    const data = await res.json();
    const items = data.Item ?? [];
    if (!items.length) break;
    if (Array.isArray(items)) allItems.push(...items);
    else allItems.push(items);
    if (items.length < limit) break;
    offset += limit;
  }

  // Get existing products
  const { data: existing } = await supabase.from('pos_products')
    .select('id, lightspeed_product_id, sku')
    .eq('business_id', business_id);

  const existingByLs  = new Map((existing ?? []).filter(e => e.lightspeed_product_id).map(e => [e.lightspeed_product_id, e.id]));
  const existingBySku = new Map((existing ?? []).filter(e => e.sku).map(e => [e.sku, e.id]));

  let imported = 0, updated = 0, skipped = 0;

  for (const item of allItems) {
    const name     = item.description ?? item.customSku ?? 'Unknown';
    const sku      = item.customSku || item.systemSku || null;
    const barcode  = item.upc || item.ean || null;

    const priceAmt  = item.Prices?.ItemPrice?.amount ?? item.defaultPrice ?? '0';
    const costAmt   = item.defaultCost ?? '0';
    const price     = parseFloat(priceAmt) || 0;
    const costPrice = parseFloat(costAmt) || 0;

    const inventory = item.ItemInventories?.ItemInventory;
    const stock     = parseInt(Array.isArray(inventory) ? inventory[0]?.qoh : inventory?.qoh ?? '0') || 0;

    const productPayload = {
      business_id,
      name,
      price,
      cost_price: costPrice > 0 ? costPrice : null,
      sku,
      barcode,
      stock_quantity: stock,
      track_stock: true,
      is_active: item.archived !== 'true' && item.archived !== true,
      source: 'lightspeed',
      lightspeed_product_id: String(item.itemID),
      external_updated_at: new Date().toISOString(),
    };

    const existingId = existingByLs.get(String(item.itemID))
      ?? (sku ? existingBySku.get(sku) : undefined);

    if (existingId) {
      await supabase.from('pos_products').update({
        price,
        cost_price: productPayload.cost_price,
        stock_quantity: stock,
        external_updated_at: productPayload.external_updated_at,
      }).eq('id', existingId);
      updated++;
    } else {
      const { error: insErr } = await supabase.from('pos_products').insert(productPayload);
      if (!insErr) imported++;
      else skipped++;
    }
  }

  // Save connection
  await supabase.from('lightspeed_connections').upsert({
    business_id,
    account_id: lightspeed_account_id,
    access_token: lightspeed_token,
    last_synced_at: new Date().toISOString(),
    sync_status: 'synced',
  }, { onConflict: 'business_id' });

  return NextResponse.json({ ok: true, total: allItems.length, imported, updated, skipped });
}
