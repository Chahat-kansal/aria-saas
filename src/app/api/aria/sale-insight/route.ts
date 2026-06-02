export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 25;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface SaleItem { product_name: string | null; quantity: number | null; unit_price: number | null; line_total?: number | null }
interface PastSale { id: string; created_at: string; total_amount: number | null }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { sale_id } = await req.json();
  if (!sale_id) return NextResponse.json({ error: 'sale_id required' }, { status: 400 });

  const { data: sale } = await supabase.from('pos_sales')
    .select('id, total_amount, payment_method, status, customer_id, served_by, created_at')
    .eq('id', sale_id).eq('business_id', bid).maybeSingle();
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: items } = await supabase.from('pos_sale_items')
    .select('product_name, quantity, unit_price, line_total').eq('sale_id', sale_id);
  const lines = (items ?? []) as SaleItem[];

  let customerHistory: { count: number; lifetime_value: number; last_sale_at: string | null; recent: PastSale[] } | null = null;
  if (sale.customer_id) {
    const { data: past } = await supabase.from('pos_sales')
      .select('id, created_at, total_amount').eq('business_id', bid)
      .eq('customer_id', sale.customer_id).neq('status', 'voided')
      .order('created_at', { ascending: false }).limit(20);
    const list = (past ?? []) as PastSale[];
    customerHistory = {
      count: list.length,
      lifetime_value: Math.round(list.reduce((a, s) => a + Number(s.total_amount ?? 0), 0) * 100) / 100,
      last_sale_at: list[0]?.created_at ?? null,
      recent: list.slice(0, 5),
    };
  }

  let insight = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 220,
      temperature: 0.3,
      system: 'You are a friendly retail intelligence assistant. Give a 1-2 sentence insight about a single sale. Surface anything notable: high value, refund pattern, repeat customer, attach-rate opportunity, slow movers. No preamble.',
      messages: [{ role: 'user', content: `Sale ${sale.id}\nWhen: ${sale.created_at}\nStaff: ${sale.served_by ?? 'unknown'}\nPayment: ${sale.payment_method ?? 'cash'}\nStatus: ${sale.status}\nTotal: A$${Number(sale.total_amount ?? 0).toFixed(2)}\nLine items: ${JSON.stringify(lines)}\nCustomer history: ${customerHistory ? JSON.stringify(customerHistory) : 'walk-in'}` }],
    });
    insight = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    inputTokens = res.usage.input_tokens; outputTokens = res.usage.output_tokens; success = true;
  } catch (e) { console.error('[sale-insight] AI failed:', (e as Error).message); }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'sale_insight', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'sale_analysis',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch { /* non-fatal */ }
  })());

  return NextResponse.json({ insight, customer_history: customerHistory });
}

export const POST = withErrorCapture('aria/sale-insight', _POST);
