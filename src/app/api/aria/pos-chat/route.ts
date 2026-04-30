export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { message, business_id, cart_items, current_sale_total } = await req.json();
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

  // Verify business ownership
  const bid = await getBid(supabase, user.id);
  if (!bid || (business_id && bid !== business_id)) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }
  const resolvedBid = business_id ?? bid;

  // Fetch business name
  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', resolvedBid)
    .single();

  const today = new Date().toISOString().split('T')[0];

  // Load context in parallel
  const [salesRes, stockRes, promoRes] = await Promise.all([
    supabase
      .from('pos_sales')
      .select('id, total_amount')
      .eq('business_id', resolvedBid)
      .eq('status', 'completed')
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lte('created_at', `${today}T23:59:59.999Z`),
    supabase
      .from('pos_products')
      .select('name, stock_quantity')
      .eq('business_id', resolvedBid)
      .eq('is_active', true)
      .order('stock_quantity', { ascending: false })
      .limit(10),
    supabase
      .from('pos_promotions')
      .select('name, type, discount_value')
      .eq('business_id', resolvedBid)
      .eq('is_active', true)
      .limit(5),
  ]);

  const sales = salesRes.data ?? [];
  const txCount = sales.length;
  const revenue = sales.reduce((sum, s) => sum + (s.total_amount as number ?? 0), 0).toFixed(2);

  const topProducts = (stockRes.data ?? [])
    .map((p) => `${p.name as string} (${p.stock_quantity as number} in stock)`)
    .join(', ') || 'No stock data';

  const promotions = promoRes.error
    ? 'No active offers'
    : (promoRes.data ?? []).map((p) => `${p.name as string} (${p.type as string}: ${p.discount_value as number})`).join(', ') || 'No active offers';

  const cartSummary = cart_items?.length
    ? `${(cart_items as Array<{ name?: string; quantity?: number }>).map((i) => `${i.quantity ?? 1}x ${i.name ?? 'item'}`).join(', ')} — total A$${current_sale_total ?? '0.00'}`
    : 'Empty cart';

  const systemPrompt = `You are Aria, an AI assistant in a point-of-sale terminal for ${business?.name ?? 'this business'}.
Help staff members quickly during sales. Be extremely concise — 1-2 sentences max.
Current time: ${new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney' })}
Today's sales: ${txCount} transactions, A$${revenue} total
Stock highlights: ${topProducts}
Active offers: ${promotions}
Current cart: ${cartSummary}
Answer questions about stock, promotions, today's performance. Use A$ for currency. Never make up numbers not in context.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: 'user', content: message as string }],
    });

    const reply = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ reply: "Sorry, I couldn't process that right now." });
  }
}
