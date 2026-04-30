import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface IntelMessage {
  type: 'offer' | 'stock' | 'margin' | 'bundle' | 'customer' | 'recipe' | 'compliance' | 'warning';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  message: string;
  staff_prompt: string | null;
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
}

interface SuggestedAction {
  type: string;
  label: string;
  requires_approval: boolean;
  payload: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json();
  const { business_id, product_id, cart_items = [], customer_id } = body;
  if (!business_id || !product_id) {
    return NextResponse.json({ error: 'business_id and product_id required' }, { status: 400 });
  }

  // Verify business ownership
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, industry')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

  // Load all required data in parallel
  const [productRes, saleHistoryRes, customerRes] = await Promise.all([
    supabase.from('pos_products').select('*').eq('id', product_id).eq('business_id', business_id).maybeSingle(),
    supabase.from('pos_sale_items').select('quantity, unit_price, created_at').eq('product_id', product_id)
      .eq('business_id', business_id).gte('created_at', since30).order('created_at', { ascending: false }).limit(50),
    customer_id
      ? supabase.from('pos_customers').select('name, loyalty_points, total_spent, visit_count').eq('id', customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Load promotions and recipe links with graceful fallback
  let activePromotions: any[] = [];
  let recipeLinks: any[] = [];
  try {
    const promosRes = await supabase
      .from('pos_promotions')
      .select('*')
      .eq('business_id', business_id)
      .eq('active', true)
      .limit(20);
    activePromotions = promosRes.data ?? [];
  } catch { /* table may not exist yet */ }
  try {
    const recipeRes = await supabase
      .from('recipe_ingredients')
      .select('recipe_id, recipes(name)')
      .eq('product_id', product_id)
      .limit(3);
    recipeLinks = recipeRes.data ?? [];
  } catch { /* table may not exist yet */ }

  const product = productRes.data;
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const saleHistory = saleHistoryRes.data ?? [];
  const customer = customerRes.data ?? null;

  const messages: IntelMessage[] = [];
  const suggested_actions: SuggestedAction[] = [];
  const missing_data: string[] = [];

  // ── 1. Stock alerts (deterministic) ──────────────────────────
  if (product.track_stock && product.stock_quantity != null) {
    const stock = Number(product.stock_quantity);
    const threshold = Number(product.low_stock_threshold ?? 5);
    const cartQty = (cart_items as any[]).reduce((s: number, i: any) => i.product_id === product_id ? s + i.qty : s, 0) + 1;

    if (stock === 0) {
      messages.push({
        type: 'stock',
        priority: 'urgent',
        title: 'Out of stock',
        message: `${product.name} is currently out of stock.`,
        staff_prompt: 'This item is out of stock — let the customer know and suggest an alternative.',
        evidence: [`Stock level: 0`],
        confidence: 'high',
      });
    } else if (stock - cartQty <= 0) {
      messages.push({
        type: 'stock',
        priority: 'high',
        title: 'Last one',
        message: `This is the last unit of ${product.name}.`,
        staff_prompt: `Only 1 left — let customer know. Flag for reorder.`,
        evidence: [`Current stock: ${stock}`],
        confidence: 'high',
      });
    } else if (stock <= threshold) {
      const remaining = stock - cartQty;
      messages.push({
        type: 'stock',
        priority: 'medium',
        title: `Low stock — ${remaining} left after this sale`,
        message: `Stock will be ${remaining} after this sale. Reorder point is ${threshold}.`,
        staff_prompt: remaining <= 2
          ? `Only ${remaining} left after this sale. Flag for reorder now.`
          : `Running low: ${remaining} left after this sale.`,
        evidence: [`Current stock: ${stock}`, `Reorder threshold: ${threshold}`],
        confidence: 'high',
      });
      suggested_actions.push({
        type: 'reorder',
        label: `Reorder ${product.name}`,
        requires_approval: true,
        payload: { product_id, product_name: product.name, current_stock: stock },
      });
    }
  } else if (product.track_stock) {
    missing_data.push('stock level');
  }

  // ── 2. Margin check (deterministic) ─────────────────────────
  if (product.cost_price && product.price) {
    const cost = Number(product.cost_price);
    const price = Number(product.price);
    const margin = ((price - cost) / price) * 100;
    if (margin < 10 && margin >= 0) {
      messages.push({
        type: 'margin',
        priority: 'high',
        title: 'Very low margin',
        message: `Margin is ${margin.toFixed(0)}% — below 10%. Flag for owner review.`,
        staff_prompt: `Margin on this item is very low. Don't apply any discounts without manager approval.`,
        evidence: [`Cost: A$${cost.toFixed(2)}`, `Price: A$${price.toFixed(2)}`, `Margin: ${margin.toFixed(0)}%`],
        confidence: 'high',
      });
    } else if (margin < 0) {
      messages.push({
        type: 'warning',
        priority: 'urgent',
        title: 'Selling below cost',
        message: `This product is priced below cost price. Owner review needed.`,
        staff_prompt: 'Price may be wrong — check with manager before completing sale.',
        evidence: [`Cost: A$${cost.toFixed(2)}`, `Price: A$${price.toFixed(2)}`],
        confidence: 'high',
      });
    }
  } else {
    missing_data.push('cost price');
  }

  // ── 3. Active promotions for this product ────────────────────
  const matchingPromos = (activePromotions ?? []).filter((promo: any) => {
    const ids: string[] = Array.isArray(promo.product_ids) ? promo.product_ids : [];
    return ids.includes(product_id);
  });

  for (const promo of matchingPromos.slice(0, 2)) {
    let promoMessage = '';
    let staffPrompt = '';

    if (promo.promotion_type === 'multibuy' && promo.buy_quantity && promo.bundle_price) {
      promoMessage = `${promo.name}: ${promo.buy_quantity} for A$${Number(promo.bundle_price).toFixed(2)}`;
      staffPrompt = `Ask customer: "Would you like ${promo.buy_quantity} for A$${Number(promo.bundle_price).toFixed(2)}? It's our ${promo.name} deal."`;
    } else if (promo.promotion_type === 'percentage_discount' && promo.discount_percent) {
      promoMessage = `${promo.name}: ${promo.discount_percent}% off`;
      staffPrompt = `${promo.name} is active — ${promo.discount_percent}% off this item.`;
    } else if (promo.promotion_type === 'fixed_discount' && promo.discount_amount) {
      promoMessage = `${promo.name}: A$${Number(promo.discount_amount).toFixed(2)} off`;
      staffPrompt = `${promo.name} is active — A$${Number(promo.discount_amount).toFixed(2)} off this item.`;
    } else {
      promoMessage = promo.name;
      staffPrompt = `Active offer: ${promo.name}`;
    }

    messages.push({
      type: 'offer',
      priority: 'high',
      title: `Active offer: ${promo.name}`,
      message: promoMessage,
      staff_prompt: staffPrompt,
      evidence: [`Promotion: ${promo.name}`, `Type: ${promo.promotion_type}`],
      confidence: 'high',
    });
  }

  // ── 4. Age restriction check ─────────────────────────────────
  const ageRestrictedCategories = ['alcohol', 'liquor', 'beer', 'wine', 'spirits', 'tobacco', 'vape', 'adult'];
  const category = (product.category ?? '').toLowerCase();
  const productName = (product.name ?? '').toLowerCase();
  if (ageRestrictedCategories.some(c => category.includes(c) || productName.includes(c))) {
    messages.push({
      type: 'compliance',
      priority: 'urgent',
      title: 'Age-restricted product',
      message: `${product.name} is age-restricted. Check customer ID.`,
      staff_prompt: 'Age-restricted product — check ID before completing sale. Customer must be 18+.',
      evidence: [`Category: ${product.category ?? 'unknown'}`, 'Australian law requires ID check for age-restricted products'],
      confidence: 'high',
    });
  }

  // ── 5. Recipe / ingredient impact ───────────────────────────
  if (recipeLinks.length > 0) {
    const recipeNames = recipeLinks
      .map((r: any) => r.recipes?.name)
      .filter(Boolean)
      .join(', ');
    if (recipeNames) {
      messages.push({
        type: 'recipe',
        priority: 'low',
        title: 'Used in recipes',
        message: `This ingredient is used in: ${recipeNames}`,
        staff_prompt: null,
        evidence: [`Recipe links: ${recipeNames}`],
        confidence: 'medium',
      });
    }
  }

  // ── 6. Sales velocity ────────────────────────────────────────
  if (saleHistory.length > 0) {
    const totalQty = saleHistory.reduce((s: number, i: any) => s + Number(i.quantity ?? 1), 0);
    const avgPerDay = totalQty / 30;
    if (avgPerDay > 5) {
      messages.push({
        type: 'bundle',
        priority: 'low',
        title: 'Fast seller',
        message: `${product.name} averages ${avgPerDay.toFixed(1)} units/day over the last 30 days.`,
        staff_prompt: null,
        evidence: [`${totalQty} units sold in 30 days`],
        confidence: 'medium',
      });
    }
  } else {
    missing_data.push('sales history');
  }

  // ── 7. Customer purchase history ────────────────────────────
  if (customer && customer.visit_count && customer.visit_count > 3) {
    // Customer is a returning customer — note it
    messages.push({
      type: 'customer',
      priority: 'low',
      title: `Returning customer`,
      message: `${customer.name} has visited ${customer.visit_count} times. Total spend: A$${Number(customer.total_spent ?? 0).toFixed(0)}.`,
      staff_prompt: null,
      evidence: [`Visits: ${customer.visit_count}`, `Total spend: A$${Number(customer.total_spent ?? 0).toFixed(0)}`],
      confidence: 'high',
    });
  }

  // Sort by priority
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  messages.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return NextResponse.json({
    product_id,
    product_name: product.name,
    messages: messages.slice(0, 5), // top 5 most important
    suggested_actions,
    missing_data,
  });
}
