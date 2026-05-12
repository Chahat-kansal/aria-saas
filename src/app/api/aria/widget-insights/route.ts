import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Simple 1-hour in-memory cache
const cache = new Map<string, { data: any; expires: number }>();

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const cacheKey = `insights_${business_id}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.data);

  // Fetch last 50 conversations
  const { data: convos } = await supabase
    .from('widget_conversations')
    .select('messages')
    .eq('business_id', business_id)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (!convos || convos.length === 0) {
    return NextResponse.json({ themes: [], total_conversations: 0 });
  }

  // Extract first user message from each conversation
  const userMessages: string[] = [];
  for (const c of convos) {
    const msgs = Array.isArray(c.messages) ? c.messages : [];
    const first = msgs.find((m: any) => m.role === 'user');
    if (first?.content) userMessages.push(first.content);
  }

  let themes: { theme: string; count: number; example: string }[] = [];
  try {
    const msg = await trackAICall({ route: 'aria/widget-insights', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'widget-insights' }, () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'You are Aria. Return ONLY valid JSON, no markdown.',
      messages: [{
        role: 'user',
        content: `Group these ${userMessages.length} customer questions into top 5 themes. Return JSON array:
[{"theme":"theme name","count":number,"example":"exact question"}]

Questions: ${JSON.stringify(userMessages.slice(0, 50))}`,
      }],
    }));
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) themes = JSON.parse(m[0]);
  } catch { /* return empty themes */ }

  const result = { themes, total_conversations: convos.length };
  cache.set(cacheKey, { data: result, expires: Date.now() + 3600_000 });
  return NextResponse.json(result);
}

export const POST = withErrorCapture('aria/widget-insights', _POST)
