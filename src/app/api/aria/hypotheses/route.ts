export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

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
