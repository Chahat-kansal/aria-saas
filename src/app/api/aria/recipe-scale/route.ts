export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, recipe_name, current_serves, target_serves, ingredients } = await req.json();
  if (!business_id || !target_serves || !Array.isArray(ingredients)) {
    return NextResponse.json({ error: 'business_id, target_serves, ingredients required' }, { status: 400 });
  }

  const factor = target_serves / Math.max(1, current_serves || 1);
  const scaled = ingredients.map((ing: { ingredient_name: string; quantity: number; unit: string }) => ({
    ingredient_name: ing.ingredient_name,
    quantity: Math.round((ing.quantity ?? 0) * factor * 100) / 100,
    unit: ing.unit ?? 'g',
  }));

  let warnings: { ingredient: string; note: string; suggested_quantity?: number }[] = [];
  let inputTokens = 0, outputTokens = 0, aiSuccess = false;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: 0,
      system: 'You are a culinary scaling expert. Return ONLY valid JSON, no preamble.',
      messages: [{ role: 'user', content: `Recipe "${recipe_name}" scaled ${current_serves} → ${target_serves} serves (×${factor.toFixed(2)}).\nScaled ingredients:\n${JSON.stringify(scaled)}\n\nIdentify any ingredients that should NOT scale linearly (spices, salt, baking powder, yeast, leavening agents). Return JSON:\n{"warnings":[{"ingredient":"...","note":"...","suggested_quantity":<number>}]}\nIf none, return {"warnings":[]}.` }],
    });
    const text = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('');
    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;
    const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s >= 0 && e > s) {
      const parsed = JSON.parse(clean.slice(s, e + 1));
      if (Array.isArray(parsed.warnings)) { warnings = parsed.warnings; aiSuccess = true; }
    }
  } catch (e) { console.error('[recipe-scale] AI failed:', (e as Error).message); }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id, agent_key: 'recipe_scale', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'scale',
        input_tokens: inputTokens, output_tokens: outputTokens, success: aiSuccess,
      });
    } catch (e) { console.error('[non-fatal]', e) }
  })());

  return NextResponse.json({ scaled, factor, warnings });
}

export const POST = withErrorCapture('aria/recipe-scale', _POST);
