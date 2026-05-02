export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string
): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: Request): Promise<Response> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    business_id?: string;
    metric?: string;
    value?: number;
    context?: object;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ explanation: null });
  }

  const business_id = body.business_id ?? (await getBid(supabase, user.id));
  if (!business_id) return NextResponse.json({ explanation: null });

  // Ownership check
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ explanation: null });

  const metric = body.metric ?? '';
  const value = body.value ?? 0;
  const context = body.context ?? {};

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const [recentSalesRes, prevSalesRes] = await Promise.all([
      supabase
        .from('pos_sales')
        .select('total_amount, created_at')
        .eq('business_id', business_id)
        .eq('status', 'completed')
        .gte('created_at', `${sevenDaysAgo}T00:00:00`),
      supabase
        .from('pos_sales')
        .select('total_amount, created_at')
        .eq('business_id', business_id)
        .eq('status', 'completed')
        .gte('created_at', `${fourteenDaysAgo}T00:00:00`)
        .lt('created_at', `${sevenDaysAgo}T00:00:00`),
    ]);

    const recentRevenue = (recentSalesRes.data ?? []).reduce(
      (s: number, x: { total_amount: number | null }) => s + (x.total_amount ?? 0),
      0
    );
    const recentTx = (recentSalesRes.data ?? []).length;

    const prevRevenue = (prevSalesRes.data ?? []).reduce(
      (s: number, x: { total_amount: number | null }) => s + (x.total_amount ?? 0),
      0
    );
    const prevTx = (prevSalesRes.data ?? []).length;

    const revChange =
      prevRevenue > 0
        ? (((recentRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1)
        : 'N/A';

    const salesContext = `Last 7 days: A$${recentRevenue.toFixed(2)} from ${recentTx} transactions. Previous 7 days: A$${prevRevenue.toFixed(2)} from ${prevTx} transactions. Revenue change: ${revChange}%.`;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system:
        'You are Aria explaining a business metric to an owner. 2 sentences max. Be specific about WHY the number is what it is. Suggest one action.',
      messages: [
        {
          role: 'user',
          content: `The metric '${metric}' is currently ${value}. Context: ${JSON.stringify(context)}. Business data: ${salesContext}. Explain this.`,
        },
      ],
    });

    const explanation =
      msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return NextResponse.json({ explanation });
  } catch (err) {
    console.error('[aria/explain-metric] error', err);
    return NextResponse.json({ explanation: null });
  }
}
