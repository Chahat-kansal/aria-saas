export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { parseLLMJsonOr } from '@/lib/ai-json';
import Anthropic from '@anthropic-ai/sdk';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const client = new Anthropic();

const SYSTEM = `You are Aria, an AI advisor for an Australian retail business. Generate 2 concise insight bullets about a specific customer. Each bullet must: (1) contain a specific number or date, (2) end with a concrete action. Max 22 words per bullet. Australian English. No z's. Return ONLY valid JSON: {"bullets":["...","..."]}. No markdown.`;

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    customer_name, total_orders, ltv, avg_order,
    days_since_last_visit, segment, churn_risk,
    predicted_next_visit_days,
  } = body;

  const context = `Customer: ${customer_name}
Segment: ${segment} | Churn risk: ${churn_risk}%
Total orders: ${total_orders} | Lifetime value: A$${Number(ltv).toFixed(0)}
Avg order: A$${Number(avg_order).toFixed(2)}
Days since last visit: ${days_since_last_visit ?? 'unknown'}
Predicted next visit: ${predicted_next_visit_days != null ? `in ${predicted_next_visit_days} days` : 'not calculable (< 2 visits)'}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: context }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    const parsed = parseLLMJsonOr<{ bullets?: string[] }>(text, { bullets: [] }, 'customers/insight');
    return NextResponse.json({ bullets: parsed.bullets ?? [] });
  } catch (e) {
    console.warn('[customer-insight] failed:', e);
    return NextResponse.json({ bullets: [] });
  }
}

export const POST = withErrorCapture('pos/customers/insight', _POST)
