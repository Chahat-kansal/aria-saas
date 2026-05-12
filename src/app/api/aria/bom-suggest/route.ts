export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

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
    const msg = await trackAICall({ route: 'aria/bom-suggest', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'bom-suggest' }, () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `${ARIA_VOICE}\n\nReturn ONLY valid JSON, no markdown.`,
      messages: [{
        role: 'user',
        content: `For an Australian ${(biz as any).industry ?? 'wholesale'} business, suggest likely components for assembling or kitting "${finished_item_name}".
Return JSON: { "components": [{ "name": "string", "typical_quantity": number, "unit": "string" }] }
Maximum 8 components. Be specific to Australian products and industry context.`,
      }],
    }));

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return NextResponse.json({ components: parsed.components ?? [] });
    }
  } catch { /* fall through */ }

  return NextResponse.json({ components: [] });
}

export const POST = withErrorCapture('aria/bom-suggest', _POST)
