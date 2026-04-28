export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { decryptField } from '@/lib/encryption';
import { NextResponse } from 'next/server';

const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

async function squareFetch(token: string, path: string, body?: object) {
  const res = await fetch(`${SQUARE_BASE}/v2${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-01-17',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Square API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function calcChurnRisk(lastVisitAt: string | null, visitFreqDays: number | null): string {
  if (!lastVisitAt) return 'high';
  const days = Math.floor((Date.now() - new Date(lastVisitAt).getTime()) / 86400000);
  const threshold = visitFreqDays ? visitFreqDays * 2 : 60;
  if (days > threshold * 3) return 'churned';
  if (days > threshold * 2) return 'high';
  if (days > threshold) return 'medium';
  return 'low';
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();

  // Allow both authenticated user calls and internal cron calls
  const { business_id, _cron } = await req.json().catch(() => ({}));

  if (!_cron) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  }

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  // Get encrypted tokens
  const { data: conn } = await supabase.from('square_connections')
    .select('*').eq('business_id', business_id).single();

  if (!conn) return NextResponse.json({ error: 'Square not connected' }, { status: 404 });

  // Update sync status
  await supabase.from('square_connections').update({ sync_status: 'syncing' }).eq('business_id', business_id);

  try {
    const token = decryptField(conn.access_token, business_id);

    // 1. Fetch catalogue items
    let cursor: string | undefined;
    const allItems: any[] = [];
    do {
      const res = await squareFetch(token, '/catalog/list?types=ITEM', cursor ? { cursor } : undefined);
      allItems.push(...(res.objects ?? []));
      cursor = res.cursor;
    } while (cursor);

    // Upsert items
    for (const obj of allItems) {
      if (obj.type !== 'ITEM') continue;
      const item = obj.item_data;
      for (const variation of (item.variations ?? [])) {
        const vd = variation.item_variation_data;
        await supabase.from('square_items').upsert({
          business_id,
          square_item_id: obj.id,
          square_variation_id: variation.id,
          name: item.name,
          description: item.description ?? null,
          category: null,
          price_cents: vd?.price_money?.amount ?? null,
          sku: vd?.sku ?? null,
          track_inventory: true,
          last_updated_at: new Date().toISOString(),
        }, { onConflict: 'business_id,square_item_id' });
      }
    }

    // 2. Fetch inventory counts
    const invRes = await squareFetch(token, '/inventory/batch-retrieve-counts', {
      catalog_object_ids: allItems.map((o) => o.id),
    });
    for (const count of (invRes.counts ?? [])) {
      if (count.state === 'IN_STOCK') {
        await supabase.from('square_items')
          .update({ current_stock: parseInt(count.quantity ?? '0', 10) })
          .eq('business_id', business_id)
          .eq('square_item_id', count.catalog_object_id);
      }
    }

    // 3. Fetch orders (last 90 days)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: locData } = await supabase.from('square_connections')
      .select('square_location_id').eq('business_id', business_id).single();

    const locationIds = locData?.square_location_id ? [locData.square_location_id] : [];
    if (locationIds.length === 0) {
      const locRes = await squareFetch(token, '/locations');
      locationIds.push(...(locRes.locations ?? []).map((l: any) => l.id));
      if (locationIds[0]) {
        await supabase.from('square_connections').update({ square_location_id: locationIds[0] }).eq('business_id', business_id);
      }
    }

    let orderCursor: string | undefined;
    do {
      const ordersRes = await squareFetch(token, '/orders/search', {
        location_ids: locationIds,
        query: { filter: { date_time_filter: { created_at: { start_at: since } } }, sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' } },
        limit: 200,
        ...(orderCursor ? { cursor: orderCursor } : {}),
      });
      for (const order of (ordersRes.orders ?? [])) {
        await supabase.from('square_sales').upsert({
          business_id,
          square_order_id: order.id,
          total_cents: order.net_amounts?.total_money?.amount ?? 0,
          tax_cents: order.net_amounts?.tax_money?.amount ?? 0,
          discount_cents: order.net_amounts?.discount_money?.amount ?? 0,
          line_items: (order.line_items ?? []).map((li: any) => ({
            item_id: li.catalog_object_id ?? '',
            name: li.name ?? '',
            quantity: parseFloat(li.quantity ?? '1'),
            price_cents: li.base_price_money?.amount ?? 0,
            cost_cents: 0,
          })),
          payment_method: order.tenders?.[0]?.type ?? null,
          sold_at: order.created_at,
          location_id: order.location_id,
        }, { onConflict: 'business_id,square_order_id' });
      }
      orderCursor = ordersRes.cursor;
    } while (orderCursor);

    // 4. Fetch customers
    let custCursor: string | undefined;
    do {
      const custRes = await squareFetch(token, `/customers${custCursor ? `?cursor=${custCursor}` : ''}`);
      for (const c of (custRes.customers ?? [])) {
        const lastVisit = c.preferences?.email_unsubscribed_at ?? null;
        const visitFreq = null;
        await supabase.from('square_customers').upsert({
          business_id,
          square_customer_id: c.id,
          name: [c.given_name, c.family_name].filter(Boolean).join(' ') || null,
          email: c.email_address ?? null,
          phone: c.phone_number ?? null,
          first_visit_at: c.created_at,
          last_visit_at: lastVisit,
          visit_count: 0,
          churn_risk: calcChurnRisk(lastVisit, visitFreq),
        }, { onConflict: 'business_id,square_customer_id' });
      }
      custCursor = custRes.cursor;
    } while (custCursor);

    // Mark sync complete
    await supabase.from('square_connections').update({
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      sync_error: null,
    }).eq('business_id', business_id);

    return NextResponse.json({ ok: true, synced_at: new Date().toISOString() });
  } catch (err: any) {
    await supabase.from('square_connections').update({
      sync_status: 'error',
      sync_error: err.message,
    }).eq('business_id', business_id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
