export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { detectFraud } from '@/lib/loyalty/fraud';

// LOY-FRAUD — owner review surface for loyalty_fraud_flags. GET lists persisted flags (getBid-scoped);
// POST {action:'scan'} runs grounded detection (de-duped, idempotent); POST {action:'resolve', id} closes
// a flag. Detection NEVER silently blocks — flags are advisory for owner review.

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

interface FlagRow { id: string; customer_id: string | null; flag_type: string; details: Record<string, unknown> | null; resolved: boolean; created_at: string }

async function listFlags(bid: string) {
  const { data: flags } = await supabaseAdmin.from('loyalty_fraud_flags')
    .select('id, customer_id, flag_type, details, resolved, created_at')
    .eq('business_id', bid).order('created_at', { ascending: false }).limit(200);
  const ids = Array.from(new Set((flags ?? []).map(f => f.customer_id).filter(Boolean))) as string[];
  const { data: customers } = ids.length > 0
    ? await supabaseAdmin.from('pos_customers').select('id, name').in('id', ids)
    : { data: [] as { id: string; name: string }[] };
  const nameMap = new Map((customers ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  return (flags ?? []).map((f: FlagRow) => ({
    id: f.id, customer_id: f.customer_id, customer_name: f.customer_id ? (nameMap.get(f.customer_id) ?? 'Unknown') : 'Unknown',
    flag_type: f.flag_type, details: f.details ?? {}, resolved: f.resolved, created_at: f.created_at,
  }));
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ flags: [] });
  return NextResponse.json({ flags: await listFlags(bid) });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { action?: string; id?: string };

  if (body.action === 'resolve' && body.id) {
    // Scope the update to this owner's business (no cross-business resolve).
    await supabaseAdmin.from('loyalty_fraud_flags').update({ resolved: true }).eq('id', body.id).eq('business_id', bid);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'scan') {
    const result = await detectFraud(bid);
    return NextResponse.json({ ok: true, ...result, flags: await listFlags(bid) });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

export const GET = withErrorCapture('loyalty/fraud:get', _GET);
export const POST = withErrorCapture('loyalty/fraud:post', _POST);
