import Anthropic from '@anthropic-ai/sdk';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, suppliers } = await req.json();
  if (!business_id || !suppliers?.length) return NextResponse.json({ insights: [] });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const msg = await trackAICall({ route: 'aria/supplier-insights', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'supplier-insights' }, () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: `${ARIA_VOICE}

You are a procurement and supplier expert. Return ONLY valid JSON array, no markdown.`,
      messages: [{
        role: 'user',
        content: `Analyse these supplier performance metrics and provide one actionable insight per supplier.
Return JSON: [{"supplier":"name","insight":"one actionable sentence","rating":"good|fair|poor"}]

Suppliers: ${JSON.stringify(suppliers.slice(0, 10))}`,
      }],
    }));

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    const insights = arrMatch ? JSON.parse(arrMatch[0]) : [];
    return NextResponse.json({ insights });
  } catch { return NextResponse.json({ insights: [] }); }
}

export const POST = withErrorCapture('aria/supplier-insights', _POST)
