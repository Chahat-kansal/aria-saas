export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { parseLLMJsonOr } from '@/lib/ai-json';
import { NextResponse } from 'next/server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, finished_item_name } = body;
  if (!business_id || !finished_item_name) {
    return NextResponse.json({ error: 'business_id and finished_item_name required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id, industry').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ components: [] });
  }

  try {
    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const msg = 
await trackAICall({ route: 'aria/bom-suggest', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'bom-suggest' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 300,
      system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
      messages: [{
        role: 'user',
        content: `For an Australian ${(biz as any).industry ?? 'wholesale'} business, suggest likely components for assembling or kitting "${finished_item_name}".
Return JSON: { "components": [{ "name": "string", "typical_quantity": number, "unit": "string" }] }
Maximum 8 components. Be specific to Australian products and industry context.`,
      }],
    }));

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const parsed = parseLLMJsonOr<{ components?: unknown[] }>(raw, { components: [] }, 'bom-suggest');
    return NextResponse.json({ components: parsed.components ?? [] });
  } catch { /* fall through */ }

  return NextResponse.json({ components: [] });
}

export const POST = withErrorCapture('aria/bom-suggest', _POST)
