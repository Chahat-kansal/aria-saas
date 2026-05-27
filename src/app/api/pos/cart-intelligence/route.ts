import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CartWarning {
  type: 'promo' | 'compliance' | 'margin' | 'stock' | 'upsell';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  message: string;
  staff_prompt: string | null;
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json();
  const { business_id, cart_items = [], customer_id } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  if (!cart_items.length) return NextResponse.json({ warnings: [], upsell_prompts: [] });

  const productIds = cart_items.map((i: any) => i.product_id ?? i.product?.id).filter(Boolean);

  const productsRes = await supabase
    .from('pos_products')
    .select('id, name, price, cost_price, stock_quantity, low_stock_threshold, track_stock, category')
    .in('id', productIds)
    .eq('business_id', business_id);

  const products = productsRes.data ?? [];

  let promotions: any[] = [];
  try {
    const promosRes = await supabase
      .from('pos_promotions')
      .select('*')
      .eq('business_id', business_id)
      .eq('active', true)
      .limit(30);
    promotions = promosRes.data ?? [];
  } catch { /* table may not exist yet */ }
  const productMap = Object.fromEntries(products.map((p: any) => [p.id, p]));

  const warnings: CartWarning[] = [];

  // ── Age restriction check ────────────────────────────────────
  const ageRestrictedTerms = ['alcohol', 'liquor', 'beer', 'wine', 'spirit', 'tobacco', 'vape'];
  const hasAgeRestricted = products.some((p: any) => {
    const cat = (p.category ?? '').toLowerCase();
    const name = (p.name ?? '').toLowerCase();
    return ageRestrictedTerms.some(t => cat.includes(t) || name.includes(t));
  });
  if (hasAgeRestricted) {
    warnings.push({
      type: 'compliance',
      priority: 'urgent',
      message: 'Cart contains age-restricted items',
      staff_prompt: 'Age-restricted product in cart — check customer ID before completing sale. Must be 18+.',
    });
  }

  // ── Promotion opportunities ──────────────────────────────────
  for (const promo of promotions) {
    const promoProductIds: string[] = Array.isArray(promo.product_ids) ? promo.product_ids : [];
    if (promoProductIds.length === 0) continue;

    if (promo.promotion_type === 'multibuy' && promo.buy_quantity && promo.bundle_price) {
      const matchingItems = cart_items.filter((i: any) =>
        promoProductIds.includes(i.product_id ?? i.product?.id)
      );
      const totalQty = matchingItems.reduce((s: number, i: any) => s + (i.qty ?? 1), 0);

      if (totalQty > 0 && totalQty < promo.buy_quantity) {
        const needed = promo.buy_quantity - totalQty;
        warnings.push({
          type: 'promo',
          priority: 'high',
          message: `${promo.name}: add ${needed} more to qualify`,
          staff_prompt: `Ask customer: "Would you like ${needed} more to get the ${promo.name} deal — ${promo.buy_quantity} for A$${Number(promo.bundle_price).toFixed(2)}?"`,
        });
      }
    }

    if (promo.promotion_type === 'bogo' && promo.get_quantity) {
      const matchingItems = cart_items.filter((i: any) =>
        promoProductIds.includes(i.product_id ?? i.product?.id)
      );
      const totalQty = matchingItems.reduce((s: number, i: any) => s + (i.qty ?? 1), 0);
      if (totalQty > 0 && totalQty % (promo.buy_quantity ?? 1) !== 0) {
        warnings.push({
          type: 'promo',
          priority: 'medium',
          message: `${promo.name} offer available`,
          staff_prompt: `Buy ${promo.buy_quantity ?? 1} get ${promo.get_quantity} free offer is available — ask if customer wants another.`,
        });
      }
    }
  }

  // ── Margin risk on discounts ──────────────────────────────────
  // Check if any cart item has a discount applied that would put it below cost
  for (const i of cart_items) {
    const pid = i.product_id ?? i.product?.id;
    const p = productMap[pid];
    if (!p || !p.cost_price || !p.price) continue;
    const effectivePrice = i.discount_percent > 0
      ? Number(p.price) * (1 - Number(i.discount_percent) / 100)
      : Number(p.price);
    if (effectivePrice < Number(p.cost_price)) {
      warnings.push({
        type: 'margin',
        priority: 'high',
        message: `${p.name}: discount puts item below cost`,
        staff_prompt: `Discount on ${p.name} is below cost price. Check with manager before applying.`,
      });
    }
  }

  // ── Stock risk after sale ────────────────────────────────────
  for (const i of cart_items) {
    const pid = i.product_id ?? i.product?.id;
    const p = productMap[pid];
    if (!p?.track_stock || p.stock_quantity == null) continue;
    const remaining = Number(p.stock_quantity) - Number(i.qty ?? 1);
    if (remaining < 0) {
      warnings.push({
        type: 'stock',
        priority: 'urgent',
        message: `${p.name}: only ${p.stock_quantity} in stock`,
        staff_prompt: `Can only sell ${p.stock_quantity} × ${p.name} — not ${i.qty}. Adjust quantity.`,
      });
    }
  }

  // Feature 2: smart upsell — co-purchased items from sale history
  try {
    const cartIds = (cart_items as Array<{ product_id?: string; product?: { id?: string } }>)
      .map(i => i.product_id ?? i.product?.id).filter(Boolean) as string[]
    if (cartIds.length > 0) {
      const since = new Date(Date.now() - 60 * 86400_000).toISOString()
      const { data: salesWithItem } = await supabase.from('pos_sale_items')
        .select('sale_id, pos_sales!inner(business_id, created_at, status)')
        .eq('pos_sales.business_id', business_id).neq('pos_sales.status', 'voided')
        .gte('pos_sales.created_at', since).in('product_id', cartIds).limit(2000)
      const saleIds = Array.from(new Set(((salesWithItem ?? []) as Array<{ sale_id: string | null }>).map(r => r.sale_id).filter(Boolean) as string[]))
      if (saleIds.length >= 3) {
        const { data: otherItems } = await supabase.from('pos_sale_items')
          .select('product_id, product_name').in('sale_id', saleIds).limit(5000)
        const counts: Record<string, { name: string; count: number }> = {}
        for (const r of (otherItems ?? []) as Array<{ product_id: string | null; product_name: string | null }>) {
          if (!r.product_id || cartIds.includes(r.product_id)) continue
          if (!counts[r.product_id]) counts[r.product_id] = { name: r.product_name ?? 'item', count: 0 }
          counts[r.product_id].count++
        }
        const top = Object.values(counts).sort((a, b) => b.count - a.count)[0]
        if (top && top.count >= Math.max(3, Math.floor(saleIds.length * 0.3))) {
          warnings.push({
            type: 'upsell', priority: 'low',
            message: `Often bought together: ${top.name}`,
            staff_prompt: `Customers who buy these items often add ${top.name}. Suggest it.`,
          })
        }
      }
    }
  } catch { /* non-fatal */ }

  // Sort by priority
  const order = { urgent: 0, high: 1, medium: 2, low: 3 };
  warnings.sort((a, b) => order[a.priority] - order[b.priority]);

  return NextResponse.json({ warnings: warnings.slice(0, 5) });
}

export const POST = withErrorCapture('pos/cart-intelligence', _POST)
