export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action';
import { guardOutput } from '@/lib/aria/ground-guard';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface Ingredient {
  ingredient_name: string;
  quantity: number;
  unit: string;
  cost_per_unit: number | null;
  wastage_pct: number | null;
}

interface Suggestion {
  original_ingredient: string;
  suggested_substitute: string;
  reason: string;
  estimated_saving_per_unit: number;
  is_estimate?: boolean;        // true when the saving is NOT bounded by a real ingredient cost
  saving_basis?: string;        // how the figure was derived (audit/provenance)
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { recipe_id?: string; business_id?: string };
  const { recipe_id, business_id } = body;
  if (!recipe_id || !business_id) return NextResponse.json({ error: 'recipe_id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: recipe } = await supabaseAdmin
    .from('recipes')
    .select('id, name, category, total_cost, recipe_ingredients(ingredient_name, quantity, unit, cost_per_unit, wastage_pct)')
    .eq('id', recipe_id)
    .eq('business_id', business_id)
    .maybeSingle();

  if (!recipe) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

  const ingredients = (recipe.recipe_ingredients ?? []) as Ingredient[];
  const ingList = ingredients.map(i =>
    `- ${i.ingredient_name}: ${i.quantity} ${i.unit}${i.cost_per_unit ? ` @ A$${Number(i.cost_per_unit).toFixed(3)}/${i.unit}` : ''}${(i.wastage_pct ?? 0) > 0 ? ` (${i.wastage_pct}% wastage)` : ''}`
  ).join('\n');

  const prompt = `You are a cost-optimisation assistant for an Australian café. Analyse the following recipe and suggest exactly 2 ingredient substitutions that reduce cost while maintaining quality.

Recipe: ${recipe.name} (${recipe.category ?? 'food'})
${recipe.total_cost ? `Current total ingredient cost: A$${Number(recipe.total_cost).toFixed(2)}` : ''}

Ingredients:
${ingList || '(no ingredients recorded)'}

Respond with ONLY valid JSON, no markdown fences, exactly this structure:
{
  "suggestions": [
    {
      "original_ingredient": "exact name from list above",
      "suggested_substitute": "specific cheaper alternative",
      "reason": "one sentence why this is cheaper or equivalent quality",
      "estimated_saving_per_unit": 0.00
    }
  ]
}

Rules:
- estimated_saving_per_unit is in A$ saved per unit of the original ingredient
- Suggest realistic Australian café wholesale alternatives
- If cost data is missing, estimate from typical Australian wholesale prices
- Return exactly 2 suggestions`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
  let suggestions: Suggestion[] = [];

  try {
    const parsed = JSON.parse(text);
    suggestions = parsed.suggestions ?? [];
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { suggestions = JSON.parse(match[0]).suggestions ?? []; } catch { /* non-fatal */ }
    }
  }

  // FAB-FIX-2 — the LLM's estimated_saving_per_unit was persisted as fact. Bound it by REAL data: you cannot
  // save more than the original ingredient costs. Clamp to [0, original cost_per_unit] when that cost is known
  // and flag it; otherwise mark it an unbounded estimate. Guard the reason prose against the real costs.
  const costOf = new Map<string, number>();
  for (const ing of ingredients) {
    const c = Number(ing.cost_per_unit);
    if (Number.isFinite(c) && c > 0) costOf.set(ing.ingredient_name.trim().toLowerCase(), c);
  }
  const realCosts = Array.from(costOf.values());
  suggestions = await Promise.all(suggestions.map(async (s) => {
    const ceiling = costOf.get(String(s.original_ingredient ?? '').trim().toLowerCase());
    const rawSaving = Math.max(0, Number(s.estimated_saving_per_unit) || 0);
    const bounded = ceiling != null;
    const saving = bounded ? Math.min(rawSaving, ceiling) : rawSaving;
    const reasonGuard = await guardOutput(String(s.reason ?? ''), realCosts, { mode: 'redact', ignorePercent: true, businessId: business_id, surface: 'recipe-cost-optimiser:reason' });
    return {
      ...s,
      estimated_saving_per_unit: Math.round(saving * 1000) / 1000,
      reason: reasonGuard.text,
      is_estimate: !bounded,
      saving_basis: bounded
        ? `capped at original ingredient cost A$${ceiling.toFixed(3)}/unit`
        : 'estimate — no cost on file for the original ingredient; verify supplier quote',
    };
  }));

  const inputTokens = msg.usage.input_tokens;
  const outputTokens = msg.usage.output_tokens;

  await supabaseAdmin.from('aria_ai_calls').insert({
    business_id,
    agent_key: 'recipe_cost_optimiser',
    prompt,
    response: text,
    model: 'claude-haiku-4-5-20251001',
    tokens_used: inputTokens + outputTokens,
    cost_cents: Math.round((inputTokens * 0.00025 + outputTokens * 0.00125) * 100),
  });

  const topSaving = suggestions.reduce<Suggestion | null>(
    (best, s) => (s.estimated_saving_per_unit ?? 0) > (best?.estimated_saving_per_unit ?? 0) ? s : best,
    null
  );

  if (topSaving && (topSaving.estimated_saving_per_unit ?? 0) > 0.50) {
    await upsertAriaAction({
      business_id,
      category: 'inventory',
      title: `Swap ${topSaving.original_ingredient} → ${topSaving.suggested_substitute} in ${recipe.name}`,
      recommendation: topSaving.suggested_substitute,
      reason: topSaving.reason,
      expected_impact: topSaving.is_estimate
        ? `Estimated saving ~A$${Number(topSaving.estimated_saving_per_unit).toFixed(2)}/unit (estimate — verify supplier quote)`
        : `Estimated saving up to A$${Number(topSaving.estimated_saving_per_unit).toFixed(2)}/unit (${topSaving.saving_basis})`,
      priority: 'medium',
      status: 'pending',
      source: 'recipe_cost_optimiser',
      triggered_by: `recipe_cost_optimiser:${recipe_id}`,
      payload: { recipe_id, suggestions },
    });
  }

  return NextResponse.json({ suggestions });
}
