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

interface ActionResult {
  label: string;
  href: string;
  description: string;
}

interface AnswerResult {
  text: string;
}

type CommandResponse =
  | { type: 'answer'; results: AnswerResult[] }
  | { type: 'action'; results: ActionResult[] };

function isQuestion(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    lower.includes('how much') ||
    lower.includes('what is') ||
    lower.includes('show me') ||
    lower.includes('how many') ||
    lower.includes('compare') ||
    lower.includes('trend') ||
    lower.includes('best') ||
    lower.includes('worst') ||
    lower.includes('why') ||
    lower.includes('analyse') ||
    lower.includes('analyze')
  );
}

function isAction(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    lower.includes('send') ||
    lower.includes('create') ||
    lower.includes('add') ||
    lower.includes('navigate') ||
    lower.includes('go to') ||
    lower.includes('open')
  );
}

function mapQueryToAction(query: string): ActionResult {
  const lower = query.toLowerCase();

  if (lower.includes('winback') || lower.includes('sms')) {
    return {
      href: '/dashboard/winback',
      label: 'Send Winback SMS',
      description: 'Re-engage lapsed customers',
    };
  }
  if (
    lower.includes('stock') ||
    lower.includes('reorder') ||
    lower.includes('inventory')
  ) {
    return {
      href: '/dashboard/reorder',
      label: 'Smart Reorder',
      description: 'Review items to reorder',
    };
  }
  if (
    lower.includes('profit') ||
    lower.includes('margin') ||
    lower.includes('leak')
  ) {
    return {
      href: '/dashboard/profit-leaks',
      label: 'Profit Leaks',
      description: 'Find where money is being lost',
    };
  }
  if (lower.includes('review') || lower.includes('replies')) {
    return {
      href: '/dashboard/reviews',
      label: 'Reviews',
      description: 'Manage customer reviews',
    };
  }
  if (lower.includes('staff') || lower.includes('team')) {
    return {
      href: '/dashboard/staff',
      label: 'Staff',
      description: 'Manage team and compliance',
    };
  }
  if (lower.includes('product') || lower.includes('products')) {
    return {
      href: '/pos/products',
      label: 'Products',
      description: 'Manage product catalogue',
    };
  }

  return {
    href: '/dashboard/ask-aria',
    label: 'Ask Aria',
    description: 'Ask anything about your business',
  };
}

async function _POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[aria/command] ANTHROPIC_API_KEY is not set')
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { business_id?: string; query?: string; page?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { type: 'answer', results: [{ text: "I'm having trouble right now. Try the full Ask Aria page." }] } satisfies CommandResponse
    );
  }

  const business_id = body.business_id ?? (await getBid(supabase, user.id));
  const query = body.query ?? '';

  if (!business_id) {
    return NextResponse.json(
      { type: 'answer', results: [{ text: "I'm having trouble right now. Try the full Ask Aria page." }] } satisfies CommandResponse
    );
  }

  // Ownership check
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!biz) {
    return NextResponse.json(
      { type: 'answer', results: [{ text: "I'm having trouble right now. Try the full Ask Aria page." }] } satisfies CommandResponse
    );
  }

  try {
    // Action classification takes precedence if it matches clearly and is not also a question
    if (isAction(query) && !isQuestion(query)) {
      const action = mapQueryToAction(query);
      return NextResponse.json({
        type: 'action',
        results: [action],
      } satisfies CommandResponse);
    }

    // Question handling
    if (isQuestion(query) || !isAction(query)) {
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const [salesRes, topProductsRes, customerCountRes] = await Promise.all([
        supabase
          .from('pos_sales')
          .select('total_amount, created_at')
          .eq('business_id', business_id)
          .eq('status', 'completed')
          .gte('created_at', `${today}T00:00:00`),
        supabase
          .from('pos_sale_items')
          .select('product_name, quantity')
          .eq('business_id', business_id)
          .gte('created_at', `${sevenDaysAgo}T00:00:00`)
          .order('quantity', { ascending: false })
          .limit(5),
        supabase
          .from('pos_customers')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business_id),
      ]);

      const todayRevenue = (salesRes.data ?? []).reduce(
        (s: number, x: { total_amount: number | null }) => s + (x.total_amount ?? 0),
        0
      );
      const todayTx = (salesRes.data ?? []).length;
      const customerCount = customerCountRes.count ?? 0;

      const productSums: Record<string, number> = {};
      for (const item of topProductsRes.data ?? []) {
        const name =
          (item as { product_name: string | null }).product_name ?? 'Unknown';
        productSums[name] =
          (productSums[name] ?? 0) +
          ((item as { quantity: number | null }).quantity ?? 1);
      }
      const topProducts = Object.entries(productSums)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, qty]) => `${name} (${qty})`)
        .join(', ');

      const bizName = (biz as { id: string; name: string }).name ?? 'your business';
      const businessContext = `Today's sales: A$${todayRevenue.toFixed(2)} from ${todayTx} transactions. Total customers: ${customerCount}. Top products this week: ${topProducts || 'no data'}.`;

      const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const msg = 
await trackAICall({ route: 'aria/command', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'command-execution' }, () => anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 150,
        system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
        messages: [
          {
            role: 'user',
            content: `Business: ${bizName}. ${businessContext}\n\nQuestion: ${query}`,
          },
        ],
      }));

      const text =
        msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
      return NextResponse.json({
        type: 'answer',
        results: [{ text }],
      } satisfies CommandResponse);
    }

    // Fallback action
    const action = mapQueryToAction(query);
    return NextResponse.json({
      type: 'action',
      results: [action],
    } satisfies CommandResponse);
  } catch (err) {
    console.error('[aria/command] error', err);
    return NextResponse.json({
      type: 'answer',
      results: [
        { text: "I'm having trouble right now. Try the full Ask Aria page." },
      ],
    } satisfies CommandResponse);
  }
}

export const POST = withErrorCapture('aria/command', _POST)
