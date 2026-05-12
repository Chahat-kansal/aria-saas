import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ themes: [], total_conversations: convos.length });
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
    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const msg =
await trackAICall({ route: 'aria/widget-insights', model: 'claude-sonnet-4-6', businessId: business_id, purpose: 'widget-insights' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      temperature: 0.4,
      system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
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

  return NextResponse.json({ themes, total_conversations: convos.length });
}

export const POST = withErrorCapture('aria/widget-insights', _POST)
