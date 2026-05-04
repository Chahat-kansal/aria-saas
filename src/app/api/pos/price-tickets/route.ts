export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const { product_ids, template = 'everyday', promotional_price } = await req.json();
  if (!product_ids?.length) return NextResponse.json({ error: 'product_ids required' }, { status: 400 });

  const { data: products } = await supabase
    .from('pos_products')
    .select('id, name, price, cost_price, barcode, sku, pos_categories(name)')
    .eq('business_id', bid)
    .in('id', product_ids);

  if (!products?.length) return NextResponse.json({ error: 'No products found' }, { status: 404 });

  const isPromo = template === 'promotional';

  const labels = (products as any[]).map(p => {
    const catName = p.pos_categories?.name ?? '';
    const barcode = p.barcode ?? p.sku ?? '';
    const price = parseFloat(p.price ?? 0).toFixed(2);
    const promoPrice = promotional_price ? parseFloat(promotional_price).toFixed(2) : null;

    return `
    <div class="label ${isPromo ? 'promo' : 'everyday'}">
      <div class="category">${catName}</div>
      <div class="name">${p.name}</div>
      ${isPromo && promoPrice ? `
        <div class="was">Was <span class="strike">$${price}</span></div>
        <div class="price promo-price">$${promoPrice}</div>
      ` : `
        <div class="price">$${price}</div>
      `}
      ${barcode ? `<div class="barcode">${barcode}</div>` : ''}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Price Tickets</title>
<style>
  @media print { @page { margin: 5mm; } body { margin: 0; } .no-print { display: none; } }
  body { font-family: 'Manrope', Arial, sans-serif; background: #f5f5f5; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; }
  .label { width: 88mm; padding: 10px 14px; background: white; border: 1.5px solid #e5e5e5; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.08); page-break-inside: avoid; }
  .label.promo { border-color: #ef4444; background: linear-gradient(135deg, #fff 80%, #fee2e2); }
  .category { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 4px; }
  .name { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 8px; line-height: 1.3; }
  .price { font-size: 28px; font-weight: 900; color: #111; font-family: 'JetBrains Mono', monospace; letter-spacing: -0.03em; }
  .promo-price { color: #ef4444; }
  .was { font-size: 11px; color: #888; }
  .strike { text-decoration: line-through; }
  .barcode { font-size: 9px; color: #bbb; margin-top: 6px; font-family: monospace; }
  .no-print { text-align: center; padding: 16px; }
  .no-print button { padding: 10px 28px; background: #7C3AED; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
</style></head><body>
<div class="no-print"><button onclick="window.print()">🖨️ Print Tickets</button></div>
<div class="grid">${labels}</div>
</body></html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
