export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const POS_CAPABILITIES = `The POS system (AriaPOS) already has:
- Products with categories, variants, modifiers, images, age restriction
- Sales with served_by (cashier), customer attachment, multiple payment methods
- Staff PIN login (pos_users table with roles and permissions)
- Commission tracking (pos_commissions, pos_commission_rules tables)
- Customer loyalty points, gift cards, promotions, discounts
- Timesheets
- Full reporting (sales, inventory, cashier, commission, register closures)
- KDS (kitchen display) and table management for cafes/restaurants
- Warehouse receiving, lot tracking, bin locations, purchase orders
- Barcode scanning with Open Food Facts lookup
- Customer display (second screen via localStorage sync)`;

const ANALYSE_SYSTEM = `${ARIA_VOICE}

You are Aria's product manager AI. You understand POS systems and what's technically feasible.

${POS_CAPABILITIES}

Analyse this feature request. Return JSON only:
{
  "feasible": boolean,
  "complexity": "simple"|"medium"|"complex",
  "summary": "2 sentences: what Aria will build",
  "questions": [],
  "requires_db_change": boolean,
  "requires_ui_change": boolean,
  "existing_features_used": []
}`;

const BUILD_SYSTEM = `${ARIA_VOICE}

You are Aria's feature builder. Generate a complete implementation plan.

${POS_CAPABILITIES}

The codebase uses Next.js 14, Supabase, Tailwind CSS, light theme in POS (bg-white, bg-gray-50).

Keep it simple. Prefer extending existing tables. Prefer extending existing pages.

Return JSON only:
{
  "feature_name": "string",
  "sql_migration": "string or null",
  "api_route": { "path": "string", "method": "string", "code": "string" } | null,
  "ui_changes": [{
    "file": "string",
    "description": "string",
    "code_snippet": "string (key parts only)"
  }],
  "success_message": "string"
}`;

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, feature_request, phase = 'analyse', answers } = body;
  if (!business_id || !feature_request) {
    return NextResponse.json({ error: 'business_id and feature_request required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id, name, industry').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      phase, feasible: true, complexity: 'medium',
      summary: 'AI analysis requires ANTHROPIC_API_KEY to be configured.',
      questions: [], requires_db_change: false, requires_ui_change: true,
      existing_features_used: [],
    });
  }

  const bizCtx = `Business: ${(biz as any).name} (${(biz as any).industry ?? 'retail'}, Australia)`;

  if (phase === 'analyse') {
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: ANALYSE_SYSTEM,
        messages: [{ role: 'user', content: `${bizCtx}\n\nFeature request: "${feature_request}"` }],
      });
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const analysis = JSON.parse(match[0]);
        return NextResponse.json({ phase: 'analyse', ...analysis });
      }
    } catch { /* fall through */ }
    return NextResponse.json({ phase: 'analyse', feasible: true, complexity: 'medium', summary: 'Analysis in progress.', questions: [], requires_db_change: false, requires_ui_change: true, existing_features_used: [] });
  }

  if (phase === 'build') {
    const fullRequest = answers ? `${feature_request}\n\nClarifications: ${answers}` : feature_request;
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: BUILD_SYSTEM,
        messages: [{ role: 'user', content: `${bizCtx}\n\nBuild this feature: "${fullRequest}"` }],
      });
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const plan = JSON.parse(match[0]);
        // Save to aria_custom_features
        await supabase.from('aria_custom_features').insert({
          business_id, feature_name: plan.feature_name ?? feature_request.slice(0, 60),
          feature_request, status: 'planned', feature_plan: plan,
        }).then(() => null, () => null);
        return NextResponse.json({ phase: 'build', plan, copy_prompt: buildClaudeCodePrompt(feature_request, plan) });
      }
    } catch { /* fall through */ }
    return NextResponse.json({ phase: 'build', plan: null, error: 'Build planning failed.' });
  }

  return NextResponse.json({ error: 'Unknown phase' }, { status: 400 });
}

function buildClaudeCodePrompt(request: string, plan: Record<string, unknown>): string {
  return `# Aria Feature Request: ${request}

Aria has designed this feature. Please implement it:

## Summary
${(plan.success_message as string) ?? ''}

## SQL Migration
${(plan.sql_migration as string) ?? 'None needed'}

## API Route
${plan.api_route ? `File: ${(plan.api_route as any).path}\nMethod: ${(plan.api_route as any).method}\n\`\`\`typescript\n${(plan.api_route as any).code}\n\`\`\`` : 'None needed'}

## UI Changes
${((plan.ui_changes as any[]) ?? []).map((c: any) => `### ${c.file}\n${c.description}\n\`\`\`tsx\n${c.code_snippet}\n\`\`\``).join('\n\n')}

Requirements: Zero TypeScript errors. Follow existing patterns (createServerSupabaseClient, Tailwind light theme, font-mono for prices).`;
}
