export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { parseLLMJson } from '@/lib/ai-json';
import { NextResponse } from 'next/server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { trackAICall } from '@/lib/aria/ai-telemetry';
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GENERATE_SYSTEM = `${ARIA_VOICE}

You are Aria's feature generator. Your job is to generate a JSON config that a FeatureRenderer component will render live in the dashboard — NO CODE is generated, NO deployment happens.

Available feature_type values and when to use them:
- "metric_card"   — a single aggregated number (total sales, avg order, etc.)
- "leaderboard"   — ranked list of staff/products/customers by a metric
- "tracker"       — progress bar per customer/employee toward a goal (e.g. punch card)
- "calculator"    — interactive inputs + formula result (e.g. commission estimator)
- "data_table"    — a table of recent records

Available tables (ONLY these — never invent others):
- pos_sales        — fields: id, business_id, created_at, total, subtotal, payment_method, served_by, customer_id, customer_name, status
- pos_sale_items   — fields: id, business_id, sale_id, product_name, quantity, unit_price, total, category, created_at
- pos_commissions  — fields: id, business_id, sale_id, user_id, user_name, amount, rate, created_at, paid_at
- pos_customers    — fields: id, business_id, name, email, phone, loyalty_points, created_at
- pos_products     — fields: id, business_id, name, category, price, cost, stock_qty
- pos_timesheets   — fields: id, business_id, user_id, user_name, clock_in, clock_out, hours_worked
- staff_members    — fields: id, business_id, name, role, hourly_rate

Date range options: "today" | "this_week" | "this_month" | "last_month" | "last_7_days" | "last_30_days" | "all_time"

IMPORTANT: Return ONLY valid JSON with this exact shape:
{
  "feature_name": "short display name",
  "feature_type": "metric_card|leaderboard|tracker|calculator|data_table",
  "description": "one sentence describing what this shows",
  "location": "dashboard",
  "display_order": 0,
  "config": {
    /* fields depend on feature_type — see below */
  },
  "preview_description": "Plain English: 'This will show you X updated in real time'"
}

Config shapes by type:

metric_card:
  query: { table, type: "sum"|"count", field?, date_field?, date_range?, filters? }
  format: "currency"|"number"|"percent"
  prefix: "$" or ""
  icon: emoji
  compare: { same as query but for previous period }

leaderboard:
  rows: { table, type: "group_sum"|"count_per_customer", field?, group_field?, date_range?, limit? }
  value_label: "Sales" etc
  value_format: "currency"|"number"
  limit: 5

tracker:
  trackers: { table, type: "count_per_customer", date_range: "all_time" }
  goal: 10
  goal_label: "coffees"
  limit: 20
  empty_message: "No customers tracked yet"

calculator:
  inputs: [{ key: "sales", label: "Total Sales ($)", default: 1000, min: 0, step: 100 }]
  formula: "sales * rate / 100"  (JS expression using input keys only)
  result_label: "Commission Earned"
  result_format: "currency"

data_table:
  query: { table, type: "rows", field: "column1,column2,...", date_range?, filters?, limit? }
  columns: [{ field, label, format }]
  empty_message: "No records yet"`;

export const POST = withErrorCapture('aria/feature-builder', async (req: Request) => {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, feature_request, phase = 'generate', feature_config } = body;

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, name, industry').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── phase: generate — ask Claude Sonnet to produce a feature config ──────────
  if (phase === 'generate') {
    if (!feature_request?.trim()) return NextResponse.json({ error: 'feature_request required' }, { status: 400 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const bizCtx = `Business: ${(biz as Record<string,unknown>).name} (${(biz as Record<string,unknown>).industry ?? 'retail'}, Australia, currency: A$)`;

    try {
      const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const msg = 
await trackAICall(
        {
          route: 'aria/feature-builder',
          model: 'claude-sonnet-4-6',
          businessId: business_id,
          industry: (biz as any).industry ?? undefined,
          purpose: 'feature-generate',
        },
        () => anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1200,
      temperature: 0.2,
          system: GENERATE_SYSTEM,
          messages: [{ role: 'user', content: `${bizCtx}\n\nFeature request: "${feature_request}"` }],
        })
      );

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const { ok: cfgOk, data: config } = parseLLMJson<{ preview_description?: string; feature_name?: string }>(raw);
      if (!cfgOk || !config) return NextResponse.json({ error: 'Config generation failed — no JSON returned' }, { status: 500 });
      return NextResponse.json({ phase: 'generate', feature_config: config, preview_description: config.preview_description ?? `This will show you ${config.feature_name} updated in real time.` });
    } catch (e) {
      console.error('[feature-builder/generate]', e);
      return NextResponse.json({ error: 'Feature generation failed' }, { status: 500 });
    }
  }

  // ── phase: confirm — save the approved config to business_features ────────────
  if (phase === 'confirm') {
    if (!feature_config) return NextResponse.json({ error: 'feature_config required' }, { status: 400 });

    const { feature_name, feature_type, description, location, display_order, config } = feature_config;

    // Count existing features for display_order
    const { count } = await supabase.from('business_features').select('id', { count: 'exact', head: true }).eq('business_id', business_id);

    const { data: inserted, error: insertErr } = await supabase.from('business_features').insert({
      business_id,
      name:          feature_name ?? 'Custom Feature',
      description:   description  ?? null,
      feature_type:  feature_type ?? 'metric_card',
      location:      location     ?? 'dashboard',
      display_order: display_order ?? (count ?? 0),
      config:        config        ?? {},
      is_active:     true,
      created_by:    'aria',
    }).select('id').single();

    if (insertErr) {
      console.error('[feature-builder/confirm]', insertErr);
      return NextResponse.json({ error: 'Failed to save feature' }, { status: 500 });
    }

    return NextResponse.json({
      phase: 'confirm',
      ok: true,
      feature_id: inserted.id,
      message: `✦ **${feature_name}** has been added to your dashboard. It's live now — go to your dashboard to see it.`,
    });
  }

  return NextResponse.json({ error: 'Unknown phase' }, { status: 400 });
})
