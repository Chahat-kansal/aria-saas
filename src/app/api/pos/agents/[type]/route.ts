export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { runAgent } from '@/lib/agents/orchestrator';
import Anthropic from '@anthropic-ai/sdk';
import type { AgentType } from '@/lib/agents/types';
import { track } from '@/lib/analytics';

type Params = { params: Promise<{ type: string }> };
type Supa = ReturnType<typeof createServerSupabaseClient>;

const VALID_TYPES: AgentType[] = ['reorder', 'pricing', 'schedule'];
const RUN_RATE_CACHE = new Map<string, number>();

async function getBid(supabase: Supa, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function executeReorderApproval(supabase: Supa, bid: string, dec: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  await supabase.from('purchase_order_drafts')
    .update({ status: 'approved' })
    .eq('business_id', bid)
    .eq('draft_type', 'agent_reorder')
    .eq('status', 'pending_approval');

  const resendKey = process.env.RESEND_API_KEY;
  const poData = dec.decision_data as { supplier_name?: string; supplier_email?: string | null; lines?: Array<{ product_name?: string; qty?: number; unit_cost?: number; total?: number }>; total_cost?: number };
  const poLines = Array.isArray(poData?.lines) ? poData.lines : [];
  const poTotal = Number(poData?.total_cost ?? 0);

  if (resendKey && poData?.supplier_email) {
    try {
      const lineRows = poLines.map(l => {
        const unitCost = Number(l.unit_cost ?? 0);
        const lineTotal = Number(l.total ?? 0);
        return `<tr><td style="padding:6px 12px">${l.product_name ?? '—'}</td><td style="padding:6px 12px;text-align:center">${l.qty ?? 0}</td><td style="padding:6px 12px;text-align:right">A$${unitCost.toFixed(2)}</td><td style="padding:6px 12px;text-align:right">A$${lineTotal.toFixed(2)}</td></tr>`;
      }).join('');
      const { data: biz } = await supabase.from('businesses').select('name').eq('id', bid).single();
      const html = `<h2>Purchase Order from ${biz?.name ?? 'Aria POS'}</h2><table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%"><tr><th style="padding:8px 12px">Product</th><th style="padding:8px 12px">Qty</th><th style="padding:8px 12px">Unit</th><th style="padding:8px 12px">Total</th></tr>${lineRows}<tr><td colspan="3" style="padding:8px 12px;text-align:right;font-weight:bold">Total</td><td style="padding:8px 12px;text-align:right;font-weight:bold">A$${poTotal.toFixed(2)}</td></tr></table><p>Required by: ${new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-AU')}</p><p>Reply to confirm receipt of this order.</p>`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'orders@ariaos.site', to: poData.supplier_email, subject: `Purchase Order from ${biz?.name ?? 'Aria POS'}`, html }),
      }).catch(e => console.warn('[reorder/approve] email fetch failed (non-fatal):', (e as Error).message));
      track('po_email_sent', { supplier_name: poData.supplier_name, line_count: poLines.length, total_cents: Math.round(poTotal * 100) });
    } catch (e) {
      console.warn('[reorder/approve] email exception (non-fatal):', (e as Error).message);
    }
  } else if (!poData?.supplier_email) {
    console.info('[reorder/approve] no supplier email — skipping email');
  }

  return { success: true };
}

async function executePricingApproval(supabase: Supa, bid: string, dec: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const data = dec.decision_data as { product_id: string; suggested_price: number; current_price?: number };
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const { error } = await supabase.from('pos_future_prices').insert({
    business_id: bid,
    product_id: data.product_id,
    new_price: data.suggested_price,
    effective_date: tomorrow,
    current_price: data.current_price ?? null,
    applied: false,
  });
  if (error) {
    console.error('[pricing/approve] pos_future_prices insert failed:', error.message);
    return { success: false, error: error.message };
  }
  track('price_change_scheduled', { product_id: data.product_id, suggested_price: data.suggested_price, effective_date: tomorrow });
  return { success: true };
}

async function executeScheduleApproval(supabase: Supa, bid: string, dec: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const data = dec.decision_data as { outlet_id: string; outlet_name: string; week_start: string; total_hours: number; total_cost_cents: number };
  await supabase.from('pos_rosters')
    .update({ published: true, published_at: new Date().toISOString() })
    .eq('business_id', bid)
    .eq('outlet_id', data.outlet_id)
    .eq('week_start', data.week_start);

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const { data: staffList } = await supabase.from('pos_staff').select('name,email').eq('business_id', bid).eq('active', true).not('email', 'is', null);
      const { data: biz } = await supabase.from('businesses').select('name').eq('id', bid).single();
      for (const staff of (staffList ?? []) as Array<{ name: string; email: string }>) {
        if (!staff.email) continue;
        const html = `<h2>Your roster for week of ${data.week_start}</h2><p>Hi ${staff.name},</p><p>Your roster for the week starting <strong>${data.week_start}</strong> has been published for ${data.outlet_name}.</p><p>Log in to Aria to see your shifts: <a href="https://ariaos.site/pos">ariaos.site/pos</a></p><p>Contact ${biz?.name ?? 'the manager'} to swap shifts.</p>`;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'roster@ariaos.site', to: staff.email, subject: `Your roster for week of ${data.week_start} — ${biz?.name ?? ''}`, html }),
        }).catch(e => console.warn('[schedule/approve] staff email failed (non-fatal):', (e as Error).message));
      }
      track('roster_published', { week_start: data.week_start, total_hours: data.total_hours, total_cost_cents: data.total_cost_cents });
    } catch (e) {
      console.warn('[schedule/approve] email block exception (non-fatal):', (e as Error).message);
    }
  }
  return { success: true };
}

export async function GET(req: Request, { params }: Params) {
  const reqId = Math.random().toString(36).slice(2, 10);
  try {
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
    const { data: lastRun } = await supabase.from('agent_runs')
      .select('started_at,completed_at,decisions_count,errors')
      .eq('business_id', bid).eq('agent_type', type)
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    const { data: settings } = await supabase.from('agent_settings')
      .select('enabled,auto_approve_below_cents,config')
      .eq('business_id', bid).eq('agent_type', type).maybeSingle();

    let roster = null;
    if (type === 'schedule') {
      const { data: rosterRows } = await supabase.from('pos_rosters')
        .select('outlet_id,week_start,shifts,total_hours,total_cost_cents,published')
        .eq('business_id', bid).order('week_start', { ascending: false }).limit(5);
      roster = rosterRows;
    }

    return NextResponse.json({ decisions: decisions ?? [], last_run: lastRun, settings, roster });
  } catch (err) {
    const e = err as Error;
    console.error(`[agents/GET] ${reqId} unhandled:`, { message: e?.message, name: e?.name, stack: e?.stack });
    return NextResponse.json({ error: 'internal_error', message: e?.message ?? 'unknown', request_id: reqId }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  const reqId = Math.random().toString(36).slice(2, 10);
  try {
    const { type } = await params;
    const supabase = createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const bid = await getBid(supabase, user.id);
    if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

    const body = await req.json() as Record<string, unknown>;
    const { action, decision_id, snooze_days } = body;

    if (action === 'health') {
      const checks: Record<string, unknown> = {};
      try {
        const { data } = await supabase.from('agent_decisions').select('id').limit(1);
        checks.supabase = Array.isArray(data);
      } catch (e) { checks.supabase = (e as Error).message; }
      try {
        checks.anthropic_client = !!new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? 'test' });
      } catch (e) { checks.anthropic_client = (e as Error).message; }
      try {
        const reactEmail = await import('@react-email/components');
        checks.react_email = !!(reactEmail as Record<string, unknown>).Html;
      } catch (e) { checks.react_email = (e as Error).message; }
      checks.resend_key_set = !!process.env.RESEND_API_KEY;
      checks.anthropic_key_set = !!process.env.ANTHROPIC_API_KEY;
      checks.request_id = reqId;
      return NextResponse.json({ ok: true, checks });
    }

    if (action === 'run_now') {
      if (!VALID_TYPES.includes(type as AgentType)) {
        return NextResponse.json({ error: 'Invalid agent type' }, { status: 400 });
      }
      const rateKey = `${bid}:${type}`;
      const last = RUN_RATE_CACHE.get(rateKey) ?? 0;
      if (Date.now() - last < 60000) {
        return NextResponse.json({ error: 'Rate limited — wait 1 minute between runs' }, { status: 429 });
      }
      RUN_RATE_CACHE.set(rateKey, Date.now());

      track('agent_run_started', { agent_type: type, manual: true });
      try {
        const result = await Promise.race([
          runAgent(type as AgentType, bid),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 55_000)),
        ]);
        track('agent_run_completed', { agent_type: type, decisions: result.decisions.length, duration_ms: result.duration_ms, errors_count: result.errors.length });
        return NextResponse.json({ decisions: result.decisions, errors: result.errors.map(e => e.message), duration_ms: result.duration_ms });
      } catch (runErr) {
        const e = runErr as Error;
        console.error(`[agents/${type}/run_now] ${reqId} agent failed:`, { message: e?.message, name: e?.name, stack: e?.stack });
        return NextResponse.json({ error: e?.message ?? 'agent_failed', request_id: reqId }, { status: 500 });
      }
    }

    if (action === 'approve') {
      const decisionId = decision_id as string;
      if (!decisionId) return NextResponse.json({ error: 'missing_decision_id' }, { status: 400 });

      const { data: dec, error: fetchErr } = await supabase
        .from('agent_decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('business_id', bid)
        .single();
      if (fetchErr || !dec) {
        console.error(`[agents/approve] ${reqId} decision not found:`, fetchErr?.message);
        return NextResponse.json({ error: 'decision_not_found' }, { status: 404 });
      }

      let executionResult: { success: boolean; error?: string } = { success: false, error: 'unknown_agent_type' };
      try {
        if (dec.agent_type === 'reorder') {
          executionResult = await executeReorderApproval(supabase, bid, dec as Record<string, unknown>);
        } else if (dec.agent_type === 'pricing') {
          executionResult = await executePricingApproval(supabase, bid, dec as Record<string, unknown>);
        } else if (dec.agent_type === 'schedule') {
          executionResult = await executeScheduleApproval(supabase, bid, dec as Record<string, unknown>);
        }
      } catch (execErr) {
        const e = execErr as Error;
        console.error(`[agents/approve] ${reqId} execution threw:`, { message: e?.message, name: e?.name, stack: e?.stack });
        executionResult = { success: false, error: e?.message ?? 'execution_failed' };
      }

      await supabase.from('agent_decisions').update({
        status: executionResult.success ? 'approved' : 'failed',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        executed_at: executionResult.success ? new Date().toISOString() : null,
      }).eq('id', decisionId);

      track('agent_decision_approved', { agent_type: dec.agent_type, projected_impact_cents: (dec as Record<string, unknown>).projected_impact_cents });
      return NextResponse.json({ success: executionResult.success, message: executionResult.success ? `${dec.agent_type} decision approved` : undefined, error: executionResult.error });
    }

    if (action === 'reject') {
      await supabase.from('agent_decisions').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', decision_id as string).eq('business_id', bid);
      const { data: dec } = await supabase.from('agent_decisions').select('agent_type').eq('id', decision_id as string).single();
      track('agent_decision_rejected', { agent_type: dec?.agent_type, reason: body.reason });
      return NextResponse.json({ ok: true });
    }

    if (action === 'snooze') {
      const days = (snooze_days as number) ?? 7;
      const newExpiry = new Date(Date.now() + days * 86400000).toISOString();
      await supabase.from('agent_decisions').update({ status: 'snoozed', expires_at: newExpiry }).eq('id', decision_id as string).eq('business_id', bid);
      const { data: dec } = await supabase.from('agent_decisions').select('agent_type').eq('id', decision_id as string).single();
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
  } catch (err) {
    const e = err as Error;
    console.error(`[agents/POST] ${reqId} unhandled:`, { message: e?.message, name: e?.name, stack: e?.stack });
    return NextResponse.json({ error: 'internal_error', message: e?.message ?? 'unknown', request_id: reqId }, { status: 500 });
  }
}
