export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getSquareTokens, setSquareSyncStatus } from '@/lib/integrations/square'

const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  // Verify ownership
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // SEC-5 — read + decrypt the Square token from the encrypted store
  const tokens = await getSquareTokens(business_id);
  if (!tokens?.access_token) return NextResponse.json({ error: 'Square not connected. Connect via Settings → Integrations first.' }, { status: 400 });

  const token = tokens.access_token;

  const authHeader = { 'Authorization': `Bearer ${token}`, 'Square-Version': '2024-01-17' };

  // Fetch all catalog items (paginated)
  const allItems: any[] = [];
  let cursor: string | undefined;
  do {
    const url = `${SQUARE_BASE}/v2/catalog/list?types=ITEM&limit=200${cursor ? `&cursor=${cursor}` : ''}`;
    const res  = await fetch(url, { headers: authHeader });
    const data = await res.json();
    if (data.errors?.length) return NextResponse.json({ error: data.errors[0]?.detail || 'Square API error' }, { status: 502 });
    allItems.push(...(data.objects ?? []));
    cursor = data.cursor;
  } while (cursor);

  // Fetch inventory counts for a batch of item IDs
  const variationIds: string[] = [];
  for (const item of allItems) {
    for (const v of item.item_data?.variations ?? []) variationIds.push(v.id);
  }

  const inventoryCounts: Record<string, number> = {};
  if (variationIds.length) {
    const batchSize = 100;
    for (let i = 0; i < variationIds.length; i += batchSize) {
      const batch = variationIds.slice(i, i + batchSize);
      const invRes = await fetch(`${SQUARE_BASE}/v2/inventory/counts/batch-retrieve`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog_object_ids: batch }),
      });
      const invData = await invRes.json();
      for (const count of invData.counts ?? []) {
        inventoryCounts[count.catalog_object_id] = parseFloat(count.quantity ?? '0');
      }
    }
  }

  // Get existing products to detect duplicates
  const { data: existing } = await supabase.from('pos_products')
    .select('id, square_variation_id, sku, barcode')
    .eq('business_id', business_id);

  const existingByVariation = new Map((existing ?? []).filter(e => e.square_variation_id).map(e => [e.square_variation_id, e.id]));
  const existingBySku       = new Map((existing ?? []).filter(e => e.sku).map(e => [e.sku, e.id]));

  let imported = 0, updated = 0, skipped = 0;

  for (const item of allItems) {
    if (item.type !== 'ITEM' || !item.item_data) continue;
    const itemData   = item.item_data;
    const variations = itemData.variations ?? [];
    const multiVar   = variations.length > 1;

    for (const variation of variations) {
      const varData = variation.item_variation_data;
      if (!varData) { skipped++; continue; }

      const priceCents = varData.price_money?.amount ?? 0;
      const sku        = varData.sku || null;
      const barcode    = varData.upc || null;
      const name       = multiVar ? `${itemData.name} — ${varData.name}` : itemData.name;
      const stock      = Math.floor(inventoryCounts[variation.id] ?? 0);

      const productPayload = {
        business_id,
        name,
        description: itemData.description ?? null,
        price: Number(priceCents) / 100,
        sku,
        barcode,
        stock_quantity: stock,
        track_stock: true,
        is_active: !item.is_deleted,
        source: 'square',
        square_item_id: item.id,
        square_variation_id: variation.id,
        external_updated_at: new Date().toISOString(),
      };

      const existingId = existingByVariation.get(variation.id)
        ?? (sku ? existingBySku.get(sku) : undefined);

      if (existingId) {
        await supabase.from('pos_products').update({
          price: productPayload.price,
          stock_quantity: productPayload.stock_quantity,
          is_active: productPayload.is_active,
          external_updated_at: productPayload.external_updated_at,
        }).eq('id', existingId);
        updated++;
      } else {
        const { error: insErr } = await supabase.from('pos_products').insert(productPayload);
        if (!insErr) imported++;
        else skipped++;
      }
    }
  }

  // SEC-5 — update sync status on the encrypted store
  await setSquareSyncStatus(business_id, 'connected');

  return NextResponse.json({ ok: true, total: allItems.length, imported, updated, skipped });
}

export const POST = withErrorCapture('integrations/square/import-products', _POST)
