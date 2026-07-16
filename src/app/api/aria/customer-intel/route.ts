export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { parseLLMJsonOr } from '@/lib/ai-json';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const { customer_id } = await req.json();
  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 });

  // Fetch customer + recent sales
  // INTEL-COMPUTE-1 — this query had NO status filter at all (not even the flawed `!= 'voided'`
  // pattern BRIEF-INTEGRITY-1 fixed elsewhere): draft (held/parked carts) and refunded
  // (negative-total) rows were being summed into "Total Spend"/"Average Basket" shown to the owner
  // and fed into the churn-risk prompt below. `status = 'completed'` is the same canonical filter
  // getRevenueSnapshot() uses — a customer-scoped query can't reuse that function directly (it
  // needs individual sale rows for the item-level summary, not a business-wide aggregate), but the
  // rule itself is the same one, not a separate invention.
  const [{ data: customer }, { data: recentSales }] = await Promise.all([
    supabase.from('pos_customers').select('*').eq('id', customer_id).maybeSingle(),
    supabase.from('pos_sales').select('id, total_amount, created_at, payment_method, pos_sale_items(product_name, quantity, unit_price, line_total)').eq('business_id', bid).eq('customer_id', customer_id).eq('status', 'completed').order('created_at', { ascending: false }).limit(20),
  ]);

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const salesSummary = (recentSales ?? []).map((s: any) => ({
    date: s.created_at?.slice(0, 10),
    total: s.total_amount,
    items: (s.pos_sale_items ?? []).map((i: any) => `${i.quantity}× ${i.product_name}`).join(', '),
  }));

  const totalSpend = (recentSales ?? []).reduce((sum: number, s: any) => sum + (s.total_amount ?? 0), 0);
  const avgBasket = salesSummary.length > 0 ? totalSpend / salesSummary.length : 0;

  // INTEL-COMPUTE-1 — clv_estimate used to be a bare model-invented string ("$X,XXX per year
  // estimate"), no ground truth behind it at all. Computed here instead, deterministically, from
  // this customer's own real visit frequency — the model is only ever asked to narrate it, never
  // to produce the number itself. Fewer than 2 completed sales means no real interval between
  // visits can be established, so this honestly reports insufficient data rather than fabricating
  // or zero-defaulting a per-year figure.
  let clvEstimateCents: number | null = null
  if ((recentSales ?? []).length >= 2) {
    const sorted = [...(recentSales ?? [])].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const spanMs = new Date(sorted[sorted.length - 1].created_at).getTime() - new Date(sorted[0].created_at).getTime()
    const spanDays = spanMs / 86_400_000
    if (spanDays > 0) {
      const visitsPerYear = (sorted.length / spanDays) * 365
      clvEstimateCents = Math.round(avgBasket * visitsPerYear * 100)
    }
  }
  const clvEstimateDisplay = clvEstimateCents != null
    ? `A$${(clvEstimateCents / 100).toLocaleString('en-AU', { maximumFractionDigits: 0 })} per year (est.)`
    : 'Insufficient purchase history to estimate'

  try {
    const msg = await trackAICall({ route: 'aria/customer-intel', model: 'claude-sonnet-4-5-20250929', businessId: undefined, purpose: 'customer-intel' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      temperature: 0.6,
      messages: [{
        role: 'user',
        content: `Analyse this Australian retail customer for a POS intelligence panel.
Customer: ${customer.name}
Loyalty Points: ${customer.loyalty_points ?? 0}
Visit Count: ${customer.visit_count ?? 0}
Last Visit: ${customer.last_visit ? new Date(customer.last_visit).toLocaleDateString('en-AU') : 'Unknown'}
Total Spend: A$${totalSpend.toFixed(2)} across ${salesSummary.length} recent sales
Average Basket: A$${avgBasket.toFixed(2)}
Estimated Annual Value (ALREADY COMPUTED — cite this exact figure, do not calculate your own): ${clvEstimateDisplay}

Recent purchases:
${salesSummary.slice(0, 10).map(s => `${s.date}: ${s.items} — A$${s.total?.toFixed(2)}`).join('\n')}

Return ONLY valid JSON:
{
  "churn_risk": "LOW|MEDIUM|HIGH",
  "churn_reason": "one sentence explanation",
  "top_product_affinity": "their most purchased product category",
  "personalised_offer": "specific offer suggestion, e.g. a product/category worth featuring — do not invent a specific discount dollar amount",
  "winback_sms": "short SMS draft if HIGH churn risk, else null",
  "insight": "1-2 sentence business insight about this customer, may reference the Estimated Annual Value figure above but must not restate a different number for it"
}`,
      }],
    }));

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const intel = parseLLMJsonOr(raw, { churn_risk: 'MEDIUM', churn_reason: 'Insufficient data', top_product_affinity: 'Mixed', personalised_offer: null, winback_sms: null, insight: 'More purchase history needed.' }, 'customer-intel');
    // clv_estimate is always the code-computed value above — the model is never the source of
    // truth for this field, regardless of what it may have echoed back in its JSON.
    return NextResponse.json({ intel: { ...intel, clv_estimate: clvEstimateDisplay }, customer, total_spend: totalSpend, avg_basket: avgBasket, visit_count: salesSummary.length });
  } catch {
    return NextResponse.json({
      intel: { clv_estimate: clvEstimateDisplay, churn_risk: 'MEDIUM', churn_reason: 'Insufficient data', top_product_affinity: 'Mixed', personalised_offer: null, winback_sms: null, insight: 'More purchase history needed for full analysis.' },
      customer, total_spend: totalSpend, avg_basket: avgBasket, visit_count: salesSummary.length,
    });
  }
}

export const POST = withErrorCapture('aria/customer-intel', _POST)
