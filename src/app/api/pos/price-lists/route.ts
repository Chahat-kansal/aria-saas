export const runtime = 'nodejs'
export const dynamic = 'force-dynamic';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBid } from '@/lib/auth/get-bid'

// H-17 — POST used to spread the whole request body directly into insert(), so a client could
// set any column verbatim (business_id override, etc). Explicit allowlist matching
// pos_price_lists' real columns, verified via information_schema against prod (matches
// supabase/migrations/20260530000011_promotions_pricelist_completion.sql's CREATE TABLE).
// business_id/id/created_at are never client-settable.
const PRICE_LIST_FIELDS = ['name', 'description', 'customer_group_ids', 'is_active'] as const
function pickPriceListFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of PRICE_LIST_FIELDS) if (f in body) out[f] = body[f]
  return out
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ price_lists: [] });
  const { searchParams } = new URL(req.url);
  const listId = searchParams.get('list_id');
  const exportCsv = searchParams.get('export') === 'csv'

  if (exportCsv && listId) {
    const [listQ, itemsQ] = await Promise.all([
      supabase.from('pos_price_lists').select('name').eq('id', listId).maybeSingle(),
      supabase.from('pos_price_list_items').select('override_price, pos_products(id, name, price)').eq('price_list_id', listId).order('created_at'),
    ])
    const listName = String(listQ.data?.name ?? 'price-list')
    const rows = (itemsQ.data ?? []).map(item => {
      const prod = (Array.isArray(item.pos_products) ? item.pos_products[0] : item.pos_products) as Record<string, unknown> | null
      return ['"' + String(prod?.name ?? '') + '"', (Number(prod?.price) || 0).toFixed(2), (Number(item.override_price) || 0).toFixed(2)].join(',')
    })
    const csv = ['Product Name,Regular Price ($),Override Price ($)', ...rows].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + listName.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '-prices.csv"',
      },
    })
  }

  if (listId) {
    const { data } = await supabase.from('pos_price_list_items')
      .select('*, pos_products(id, name, price)')
      .eq('price_list_id', listId)
      .order('created_at');
    return NextResponse.json({ items: data ?? [] });
  }
  const { data: lists, error: plErr } = await supabase.from('pos_price_lists').select('*').eq('business_id', bid).order('name');
  if (plErr?.code === '42P01') return NextResponse.json({ price_lists: [] });
  const counts = await Promise.all((lists ?? []).map(l =>
    supabase.from('pos_price_list_items').select('id', { count: 'exact', head: true }).eq('price_list_id', l.id)
  ));
  const result = (lists ?? []).map((l, i) => ({ ...l, item_count: counts[i].count ?? 0 }));
  return NextResponse.json({ price_lists: result });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  const { item } = body;
  if (item) {
    // SECURITY (H-17): `item` used to be upserted raw with NO check that item.price_list_id
    // actually belongs to the caller's business — a cross-tenant write, since a caller could
    // upsert price-list items into ANY business's price list by guessing/enumerating a
    // price_list_id UUID. Verify ownership first (same pattern as the DELETE handler below),
    // then allowlist to just the real columns for the upsert itself. NOTE: the live
    // pos_price_list_items table's price column is actually named `price` (verified via
    // information_schema against prod) — the frontend/migration-file name `override_price` does
    // not exist as a column — so we accept the client's `override_price` key but write it to the
    // real `price` column.
    const priceListId = item?.price_list_id;
    if (!priceListId || !item?.product_id) return NextResponse.json({ error: 'price_list_id and product_id required' }, { status: 400 });
    const { data: list } = await supabase.from('pos_price_lists').select('id').eq('id', priceListId).eq('business_id', bid).maybeSingle();
    if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const safeItem = {
      price_list_id: priceListId,
      product_id: item.product_id,
      price: item.override_price ?? item.price,
    };
    const { data, error } = await supabase.from('pos_price_list_items').upsert(safeItem, { onConflict: 'price_list_id,product_id' }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }
  const { data, error } = await supabase.from('pos_price_lists').insert({ ...pickPriceListFields(body), business_id: bid }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ price_list: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  // SECURITY (H-17 gap-fill): PATCH was still spreading the raw body — not in the original H-17
  // list (only POST was flagged there), same table/fix as the POST allowlist above.
  const { error } = await supabase.from('pos_price_lists').update(pickPriceListFields(body)).eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  // Verify ownership before deleting — prevents cross-tenant cascade delete.
  const { data: list } = await supabase.from('pos_price_lists').select('id').eq('id', id).eq('business_id', bid).maybeSingle();
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await supabase.from('pos_price_list_items').delete().eq('price_list_id', id);
  await supabase.from('pos_price_lists').delete().eq('id', id).eq('business_id', bid);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/price-lists', _GET)
export const POST = withErrorCapture('pos/price-lists', _POST)
export const PATCH = withErrorCapture('pos/price-lists', _PATCH)
export const DELETE = withErrorCapture('pos/price-lists', _DELETE)
