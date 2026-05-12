export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
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
  const [{ data: customer }, { data: recentSales }] = await Promise.all([
    supabase.from('pos_customers').select('*').eq('id', customer_id).maybeSingle(),
    supabase.from('pos_sales').select('id, total_amount, created_at, payment_method, pos_sale_items(product_name, quantity, unit_price, line_total)').eq('business_id', bid).eq('customer_id', customer_id).order('created_at', { ascending: false }).limit(20),
  ]);

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const salesSummary = (recentSales ?? []).map((s: any) => ({
    date: s.created_at?.slice(0, 10),
    total: s.total_amount,
    items: (s.pos_sale_items ?? []).map((i: any) => `${i.quantity}× ${i.product_name}`).join(', '),
  }));

  const totalSpend = (recentSales ?? []).reduce((sum: number, s: any) => sum + (s.total_amount ?? 0), 0);
  const avgBasket = salesSummary.length > 0 ? totalSpend / salesSummary.length : 0;

  try {
    const msg = await trackAICall({ route: 'aria/customer-intel', model: 'claude-sonnet-4-6', businessId: undefined, purpose: 'customer-intel' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
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

Recent purchases:
${salesSummary.slice(0, 10).map(s => `${s.date}: ${s.items} — A$${s.total?.toFixed(2)}`).join('\n')}

Return ONLY valid JSON:
{
  "clv_estimate": "$X,XXX per year estimate",
  "churn_risk": "LOW|MEDIUM|HIGH",
  "churn_reason": "one sentence explanation",
  "top_product_affinity": "their most purchased product category",
  "personalised_offer": "specific offer suggestion e.g. '4-pack Coopers $22 (save $3)'",
  "winback_sms": "short SMS draft if HIGH churn risk, else null",
  "insight": "1-2 sentence business insight about this customer"
}`,
      }],
    }));

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');

    const intel = JSON.parse(match[0]);
    return NextResponse.json({ intel, customer, total_spend: totalSpend, avg_basket: avgBasket, visit_count: salesSummary.length });
  } catch {
    return NextResponse.json({
      intel: { clv_estimate: 'Unknown', churn_risk: 'MEDIUM', churn_reason: 'Insufficient data', top_product_affinity: 'Mixed', personalised_offer: null, winback_sms: null, insight: 'More purchase history needed for full analysis.' },
      customer, total_spend: totalSpend, avg_basket: avgBasket, visit_count: salesSummary.length,
    });
  }
}

export const POST = withErrorCapture('aria/customer-intel', _POST)
