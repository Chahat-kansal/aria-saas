export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, barcode, description } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  try {
    const msg = await trackAICall({ route: 'aria/classify-product', model: 'claude-haiku-4-5-20251001', businessId: undefined, purpose: 'product-classification' }, () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Classify this Australian retail product for a POS system.
Product name: "${name}"
${barcode ? `Barcode: ${barcode}` : ''}
${description ? `Description: ${description}` : ''}

Return ONLY valid JSON (no markdown, no explanation):
{
  "category": "Beer & Cider|Wine|Spirits|RTD|Soft Drinks|Water|Coffee|Food|Snacks|Confectionery|Dairy|Tobacco|Other",
  "brand": "extracted brand name or empty string",
  "family": "product family/subcategory e.g. Pale Ale, Shiraz, Vodka",
  "is_age_restricted": true or false,
  "tax_treatment": "gst" or "gst_free",
  "suggested_price_points": [
    {"qty": 1, "label": "Single"},
    {"qty": 4, "label": "4-pack"},
    {"qty": 24, "label": "Case"}
  ]
}`,
      }],
    }));

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Could not parse response' }, { status: 500 });

    const result = JSON.parse(match[0]);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[classify-product]', err);
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 });
  }
}

export const POST = withErrorCapture('aria/classify-product', _POST)
