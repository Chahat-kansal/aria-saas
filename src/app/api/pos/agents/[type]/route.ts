export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { runAgent } from '@/lib/agents/orchestrator';
import type { AgentType } from '@/lib/agents/types';
import { track } from '@/lib/analytics';

type Params = { params: Promise<{ type: string }> };

const VALID_TYPES: AgentType[] = ['reorder', 'pricing', 'schedule'];

const RUN_RATE_CACHE = new Map<string, number>();

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request, { params }: Params) {
  const { type } = await params;
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ decisions: [] });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'pending';

  let q = supabase.from('agent_decisions')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(50);

  if (type !== 'all') q = q.eq('agent_type', type);
  if (status !== 'all') q = q.eq('status', status);

  const { data: decisions } = await q;

  // Last run info
  const { data: lastRun } = await supabase.from('agent_runs')
    .select('started_at,completed_at,decisions_count,errors')
    .eq('business_id', bid)
    .eq('agent_type', type)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Settings
  const { data: settings } = await supabase.from('agent_settings')
    .select('enabled,auto_approve_below_cents,config')
    .eq('business_id', bid)
    .eq('agent_type', type)
    .maybeSingle();

  return NextResponse.json({ decisions: decisions ?? [], last_run: lastRun, settings });
}

export async function POST(req: Request, { params }: Params) {
  const { type } = await params;
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const body = await req.json();
  const { action, decision_id, snooze_days } = body;

  if (action === 'run_now') {
    if (!VALID_TYPES.includes(type as AgentType)) {
      return NextResponse.json({ error: 'Invalid agent type' }, { status: 400 });
    }
    // Rate limit: 1 run per minute per business per type
    const rateKey = `${bid}:${type}`;
    const last = RUN_RATE_CACHE.get(rateKey) ?? 0;
    if (Date.now() - last < 60000) {
      return NextResponse.json({ error: 'Rate limited — wait 1 minute between runs' }, { status: 429 });
    }
    RUN_RATE_CACHE.set(rateKey, Date.now());

    track('agent_run_started', { agent_type: type, manual: true });
    const result = await runAgent(type as AgentType, bid);
    track('agent_run_completed', { agent_type: type, decisions: result.decisions.length, duration_ms: result.duration_ms, errors_count: result.errors.length });
    return NextResponse.json({ decisions: result.decisions, errors: result.errors.map(e => e.message), duration_ms: result.duration_ms });
  }

  if (action === 'approve') {
    const { data: dec } = await supabase.from('agent_decisions').select('*').eq('id', decision_id).eq('business_id', bid).single();
    if (!dec) return NextResponse.json({ error: 'Decision not found' }, { status: 404 });

    await supabase.from('agent_decisions').update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), executed_at: new Date().toISOString() }).eq('id', decision_id);

    // Execute the decision
    if (dec.agent_type === 'pricing') {
      const data = dec.decision_data as { product_id: string; suggested_price: number };
      await supabase.from('pos_future_prices').insert({
        product_id: data.product_id,
        new_price: data.suggested_price,
        effective_from: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        status: 'scheduled',
        created_by: user.id,
      });
      track('price_change_scheduled', { product_id: data.product_id, suggested_price: data.suggested_price, effective_date: new Date(Date.now() + 86400000).toISOString().split('T')[0] });
    } else if (dec.agent_type === 'reorder') {
      await supabase.from('purchase_order_drafts').update({ status: 'approved' })
        .eq('business_id', bid).eq('draft_type', 'agent_reorder').eq('status', 'pending_approval');
    } else if (dec.agent_type === 'schedule') {
      const data = dec.decision_data as { outlet_id: string; week_start: string };
      await supabase.from('pos_rosters').update({ published: true, published_at: new Date().toISOString() })
        .eq('business_id', bid).eq('outlet_id', data.outlet_id).eq('week_start', data.week_start);
    }

    track('agent_decision_approved', { agent_type: dec.agent_type, projected_impact_cents: dec.projected_impact_cents });
    return NextResponse.json({ ok: true });
  }

  if (action === 'reject') {
    await supabase.from('agent_decisions').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', decision_id).eq('business_id', bid);
    const { data: dec } = await supabase.from('agent_decisions').select('agent_type').eq('id', decision_id).single();
    track('agent_decision_rejected', { agent_type: dec?.agent_type, reason: body.reason });
    return NextResponse.json({ ok: true });
  }

  if (action === 'snooze') {
    const days = snooze_days ?? 7;
    const newExpiry = new Date(Date.now() + days * 86400000).toISOString();
    await supabase.from('agent_decisions').update({ status: 'snoozed', expires_at: newExpiry }).eq('id', decision_id).eq('business_id', bid);
    const { data: dec } = await supabase.from('agent_decisions').select('agent_type').eq('id', decision_id).single();
    track('agent_decision_snoozed', { agent_type: dec?.agent_type, days });
    return NextResponse.json({ ok: true });
  }

  if (action === 'update_settings') {
    const { enabled, auto_approve_below_cents, config } = body;
    await supabase.from('agent_settings').upsert({
      business_id: bid, agent_type: type,
      enabled, auto_approve_below_cents, config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,agent_type' });
    track('agent_settings_changed', { agent_type: type, setting: 'bulk', value: enabled });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
