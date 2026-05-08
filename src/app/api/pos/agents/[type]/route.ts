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
    try {
      const { data: dec } = await supabase.from('agent_decisions').select('*').eq('id', decision_id).eq('business_id', bid).single();
      if (!dec) return NextResponse.json({ success: false, error: 'Decision not found' }, { status: 404 });

      await supabase.from('agent_decisions').update({
        status: 'approved', reviewed_by: user.id,
        reviewed_at: new Date().toISOString(), executed_at: new Date().toISOString(),
      }).eq('id', decision_id);

      const resendKey = process.env.RESEND_API_KEY;
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      if (dec.agent_type === 'pricing') {
        // pos_future_prices schema: business_id, product_id, new_price, effective_date, current_price, applied
        const data = dec.decision_data as { product_id: string; suggested_price: number; current_price?: number };
        await supabase.from('pos_future_prices').insert({
          business_id: bid,
          product_id: data.product_id,
          new_price: data.suggested_price,
          effective_date: tomorrow,
          current_price: data.current_price ?? null,
          applied: false,
        });
        track('price_change_scheduled', { product_id: data.product_id, suggested_price: data.suggested_price, effective_date: tomorrow });

      } else if (dec.agent_type === 'reorder') {
        await supabase.from('purchase_order_drafts').update({ status: 'approved' })
          .eq('business_id', bid).eq('draft_type', 'agent_reorder').eq('status', 'pending_approval');

        // Send PO email via Resend if supplier email is available
        const poData = dec.decision_data as { supplier_name?: string; supplier_email?: string | null; lines?: Array<{ product_name?: string; qty?: number; unit_cost?: number; total?: number }>; total_cost?: number };
        const poLines = Array.isArray(poData?.lines) ? poData.lines : [];
        const poTotal = Number(poData?.total_cost ?? 0);
        if (resendKey && poData?.supplier_email) {
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
          }).catch(e => console.warn('[approve/reorder] email failed:', e));
          track('po_email_sent', { supplier_name: poData.supplier_name, line_count: poLines.length, total_cents: Math.round(poTotal * 100) });
        }

      } else if (dec.agent_type === 'schedule') {
        const data = dec.decision_data as { outlet_id: string; outlet_name: string; week_start: string; total_hours: number; total_cost_cents: number };
        await supabase.from('pos_rosters').update({ published: true, published_at: new Date().toISOString() })
          .eq('business_id', bid).eq('outlet_id', data.outlet_id).eq('week_start', data.week_start);

        // Email staff members
        if (resendKey) {
          const { data: staffList } = await supabase.from('pos_staff').select('name,email').eq('business_id', bid).eq('active', true).not('email', 'is', null);
          const { data: biz } = await supabase.from('businesses').select('name').eq('id', bid).single();
          for (const staff of (staffList ?? []) as Array<{ name: string; email: string }>) {
            if (!staff.email) continue;
            const html = `<h2>Your roster for week of ${data.week_start}</h2><p>Hi ${staff.name},</p><p>Your roster for the week starting <strong>${data.week_start}</strong> has been published for ${data.outlet_name}.</p><p>Log in to Aria to see your shifts: <a href="https://ariaos.site/pos">ariaos.site/pos</a></p><p>Contact ${biz?.name ?? 'the manager'} to swap shifts.</p>`;
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: 'roster@ariaos.site', to: staff.email, subject: `Your roster for week of ${data.week_start} — ${biz?.name ?? ''}`, html }),
            }).catch(e => console.warn('[approve/schedule] email failed:', e));
          }
          track('roster_published', { week_start: data.week_start, total_hours: data.total_hours, total_cost_cents: data.total_cost_cents });
        }
      }

      track('agent_decision_approved', { agent_type: dec.agent_type, projected_impact_cents: dec.projected_impact_cents });
      return NextResponse.json({ success: true, message: `${dec.agent_type} decision approved and executed` });
    } catch (e) {
      console.error('[approve]', e);
      return NextResponse.json({ success: false, error: (e as Error).message });
    }
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
