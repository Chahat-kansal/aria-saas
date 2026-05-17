import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, cart_items } = await req.json();
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  const resolvedBid = (business_id as string | undefined) ?? bid;

  const alerts: string[] = [];
  const suggestions: string[] = [];
  const promotions_applied: string[] = [];
  let loyalty_points_earned = 0;

  if (!Array.isArray(cart_items) || cart_items.length === 0) {
    return NextResponse.json({ alerts, suggestions, promotions_applied, loyalty_points_earned });
  }

  const productIds = cart_items.map((i: any) => i.product?.id ?? i.product_id).filter(Boolean);

  // Load products, active promotions, and settings in parallel
  const [productsRes, settingsRes] = await Promise.all([
    supabase.from('pos_products').select('id, name, price, cost_price, stock_quantity, track_stock').in('id', productIds).eq('business_id', resolvedBid),
    supabase.from('pos_settings').select('loyalty_points_per_dollar').eq('business_id', resolvedBid).maybeSingle(),
  ]);
  let promosData: any[] = [];
  try {
    const { data } = await supabase.from('pos_promotions').select('*').eq('business_id', resolvedBid).eq('is_active', true);
    promosData = data ?? [];
  } catch { /* table may not exist */ }

  const productMap: Record<string, any> = {};
  for (const p of productsRes.data ?? []) productMap[p.id] = p;
  const promotions = promosData;
  const pointsPerDollar = (settingsRes.data as any)?.loyalty_points_per_dollar ?? 1;

  let cartTotal = 0;

  for (const item of cart_items) {
    const pid = item.product?.id ?? item.product_id;
    const p = productMap[pid];
    if (!p) continue;

    const qty = item.qty ?? item.quantity ?? 1;
    const unitPrice = item.unitPrice ?? item.unit_price ?? p.price;
    const lineTotal = unitPrice * qty;
    cartTotal += lineTotal;

    // Below-cost check
    if (p.cost_price && p.cost_price > 0) {
      const marginPct = ((unitPrice - p.cost_price) / unitPrice) * 100;
      if (unitPrice < p.cost_price) {
        alerts.push(`⚠ ${p.name} is priced below cost — selling at a loss.`);
      } else if (marginPct < 10) {
        alerts.push(`${p.name} margin is only ${marginPct.toFixed(0)}%.`);
      }
    }

    // Low stock after sale
    if (p.track_stock && p.stock_quantity != null) {
      const remaining = p.stock_quantity - qty;
      if (remaining < 0) {
        alerts.push(`⚠ Insufficient stock for ${p.name} (${p.stock_quantity} available, ${qty} in cart).`);
      } else if (remaining <= 3) {
        alerts.push(`Only ${remaining} of ${p.name} left after this sale.`);
      }
    }
  }

  // Loyalty points calculation
  loyalty_points_earned = Math.floor(cartTotal * pointsPerDollar);

  // Promotion matching
  for (const promo of promotions) {
    // Simple percentage discount that applies to any item
    if (promo.type === 'percentage' && promo.discount_value > 0) {
      // Only surface active promos as suggestions — don't auto-apply
      suggestions.push(`Active offer: ${promo.discount_value}% off — "${promo.name || 'Promotion'}"`);
    }
  }

  // Bundle suggestion from promotions
  for (const promo of promotions) {
    if (promo.type === 'bxgy' || promo.type === 'bundle') {
      suggestions.push(`Bundle offer available: ${promo.name ?? 'See promotions'}`);
    }
  }

  // AI high-margin alternative suggestion (only if API key present, non-blocking)
  let aiSuggestion: string | null = null;
  if (process.env.ANTHROPIC_API_KEY && suggestions.length === 0 && alerts.length === 0) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const itemNames = cart_items.map((i: any) => i.product?.name ?? i.product_name ?? 'item').join(', ');
      const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const resp = 
await trackAICall({ route: 'aria/price-intelligence', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'price-intelligence' }, () => anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 60,
        messages: [{ role: 'user', content: `Cart: ${itemNames}. Total: A$${cartTotal.toFixed(2)}. One 1-sentence upsell tip for staff. Be specific, short, Australian.` }],
      }));
      const txt = resp.content[0].type === 'text' ? resp.content[0].text.trim() : null;
      if (txt) aiSuggestion = txt;
    } catch { /* silent */ }
  }
  if (aiSuggestion) suggestions.push(aiSuggestion);

  return NextResponse.json({ alerts, suggestions, promotions_applied, loyalty_points_earned });
}

export const POST = withErrorCapture('aria/price-intelligence', _POST)
