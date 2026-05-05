export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, shopify_store_url, shopify_admin_token } = await req.json();
  if (!business_id || !shopify_store_url || !shopify_admin_token) {
    return NextResponse.json({ error: 'business_id, shopify_store_url, shopify_admin_token required' }, { status: 400 });
  }

  // Verify ownership
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Normalise store URL
  const storeHost = shopify_store_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const shopHeaders = { 'X-Shopify-Access-Token': shopify_admin_token, 'Content-Type': 'application/json' };

  // Test connectivity
  const pingRes = await fetch(`https://${storeHost}/admin/api/2024-01/shop.json`, { headers: shopHeaders });
  if (!pingRes.ok) {
    return NextResponse.json({ error: 'Cannot connect to Shopify. Check store URL and Admin API token.' }, { status: 400 });
  }
  const shopData = await pingRes.json();

  // Fetch all products (handle Link header pagination)
  const allProducts: any[] = [];
  let nextUrl: string | null = `https://${storeHost}/admin/api/2024-01/products.json?limit=250&status=active`;

  while (nextUrl) {
    const pageRes = await fetch(nextUrl, { headers: shopHeaders });
    if (!pageRes.ok) return NextResponse.json({ error: `Shopify API error: ${pageRes.status}` }, { status: 502 });
    const data = await pageRes.json();
    allProducts.push(...(data.products ?? []));

    // Check Link header for next page
    const link: string = pageRes.headers.get('link') ?? '';
    const nextMatch: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
  }

  // Get existing products to detect duplicates
  const { data: existing } = await supabase.from('pos_products')
    .select('id, shopify_variant_id, sku, barcode')
    .eq('business_id', business_id);

  const existingByVariant = new Map((existing ?? []).filter(e => e.shopify_variant_id).map(e => [e.shopify_variant_id, e.id]));
  const existingBySku     = new Map((existing ?? []).filter(e => e.sku).map(e => [e.sku, e.id]));

  let imported = 0, updated = 0, skipped = 0;

  for (const product of allProducts) {
    const variants  = product.variants ?? [];
    const multiVar  = variants.length > 1;
    const imageUrl  = product.images?.[0]?.src ?? null;

    for (const variant of variants) {
      const sku     = variant.sku || null;
      const barcode = variant.barcode || null;
      const name    = multiVar ? `${product.title} — ${variant.title}` : product.title;
      const price   = parseFloat(variant.price ?? '0') || 0;
      const stock   = variant.inventory_quantity ?? 0;
      const tracked = variant.inventory_management === 'shopify';

      const productPayload = {
        business_id,
        name,
        description: stripHtml(product.body_html),
        price,
        sku,
        barcode,
        stock_quantity: tracked ? stock : null,
        track_stock: tracked,
        is_active: product.status === 'active',
        image_url: imageUrl,
        source: 'shopify',
        shopify_product_id: String(product.id),
        shopify_variant_id: String(variant.id),
        external_updated_at: new Date().toISOString(),
      };

      const existingId = existingByVariant.get(String(variant.id))
        ?? (sku ? existingBySku.get(sku) : undefined);

      if (existingId) {
        await supabase.from('pos_products').update({
          price,
          stock_quantity: productPayload.stock_quantity,
          is_active: productPayload.is_active,
          image_url: imageUrl,
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

  // Save connection (token not returned in API responses — stored for re-use)
  await supabase.from('shopify_connections').upsert({
    business_id,
    store_url: storeHost,
    access_token: shopify_admin_token,
    shop_name: shopData.shop?.name ?? storeHost,
    last_synced_at: new Date().toISOString(),
    sync_status: 'synced',
  }, { onConflict: 'business_id' });

  return NextResponse.json({ ok: true, total: allProducts.length, imported, updated, skipped });
}
