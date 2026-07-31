export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { markHypothesesSurfaced } from '@/lib/aria/hypothesis/surface-to-decisions'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const business_id = new URL(req.url).searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabaseAdmin.from('aria_hypotheses')
    .select('id, title, description, category, predicted_impact_cents, predicted_impact_label, risk_level, confidence, status, generated_at, outcome_verdict')
    .eq('business_id', business_id)
    .order('generated_at', { ascending: false })
    .limit(20);

  // BRAIN-LOOP-1 — SET-ONCE surfacing stamp. Both browse surfaces (dashboard/hypotheses and
  // dashboard/intelligence) fetch through THIS route, so stamping here instruments both with one
  // edit. Instrumenting only the new Decisions queue would rebuild the exact blind spot the 195
  // legacy 'unknown_surfaced' rows represent. Fire-and-forget: a stamp must never delay or fail
  // the read.
  void markHypothesesSurfaced(business_id, ((data ?? []) as Array<{ id: string }>).map(h => h.id)).catch(() => {})

  return NextResponse.json({ hypotheses: data ?? [] });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Ownership: fetch the hypothesis + verify user owns the business
  const { data: hyp } = await supabaseAdmin.from('aria_hypotheses').select('id, business_id').eq('id', id).maybeSingle();
  if (!hyp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', hyp.business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // BRAIN-LOOP-1 — DELEGATE accept/decline to the ONE real acceptance path.
  //
  // This handler used to flip status here and stop. That made the intelligence page's Accept a DEAD
  // ACCEPT: the hypothesis read 'accepted' but no aria_actions row was created, so onActionApproved()
  // never ran, no baseline was snapshotted, and runOutcomeChecks() had nothing to measure — the
  // hypothesis looked acted-on and could never produce a single unit of learning. That is the same
  // blind spot this sprint exists to close, hiding one route over.
  //
  // Both surfaces now converge on PATCH /api/aria/hypotheses/[id], which creates the action row and
  // fires the baseline snapshot. Nothing is lost: that route sets status, accepted_at/rejected_at
  // and rejection_reason exactly as this one did, and adds the two steps that were missing.
  if (body.status === 'accepted' || body.status === 'rejected') {
    const { PATCH: canonicalPatch } = await import('./[id]/route')
    return canonicalPatch(
      new Request(new URL('/api/aria/hypotheses/' + id, req.url).toString(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
        body: JSON.stringify(body),
      }),
      { params: { id } },
    )
  }

  // Any other status transition (e.g. 'superseded') stays a plain field update — it is not an
  // acceptance and must not create an action.
  const patch: Record<string, unknown> = {};
  if (body.status === 'accepted') { patch.status = 'accepted'; patch.accepted_at = new Date().toISOString(); }
  else if (body.status === 'rejected') { patch.status = 'rejected'; patch.rejected_at = new Date().toISOString(); if (body.rejection_reason) patch.rejection_reason = body.rejection_reason; }
  else if (body.status) patch.status = body.status;

  const { error } = await supabaseAdmin.from('aria_hypotheses').update(patch).eq('id', id).eq('business_id', hyp.business_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('aria/hypotheses', _GET);
export const PATCH = withErrorCapture('aria/hypotheses', _PATCH);
