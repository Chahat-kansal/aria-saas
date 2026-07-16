export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const session_type = searchParams.get('type');
  let bid: string | null = null
  if (business_id) {
    // SECURITY: ownership verified
    const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
    if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    bid = biz.id
  } else {
    bid = await getBid(supabase, user.id)
  }
  if (!bid) return NextResponse.json({ sessions: [] });

  let query = supabase.from('mobile_inventory_sessions')
    .select('*').eq('business_id', bid).order('started_at', { ascending: false }).limit(20);
  if (session_type) query = query.eq('session_type', session_type);

  const { data: sessions, error } = await query;
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ sessions: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sessions: sessions ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, session_type, notes } = await req.json();
  let bid: string | null = null
  if (business_id) {
    // SECURITY: ownership verified
    const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
    if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    bid = biz.id
  } else {
    bid = await getBid(supabase, user.id)
  }
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { data: session, error } = await supabase.from('mobile_inventory_sessions').insert({
    business_id: bid,
    session_type: session_type || 'count',
    status: 'active',
    scanned_items: [],
    notes: notes || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // SECURITY-CRITICAL-3 — this handler had zero business check at all (unlike GET/POST above in
  // this same file), letting any authenticated user PATCH any business's session by guessing its
  // id. Verify ownership before any update.
  const { data: existing } = await supabase.from('mobile_inventory_sessions').select('business_id').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', existing.business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { scanned_items, status, notes } = await req.json();
  const updates: Record<string, any> = {};
  if (scanned_items !== undefined) updates.scanned_items = scanned_items;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (status === 'completed') updates.completed_at = new Date().toISOString();

  const { data: session, error } = await supabase.from('mobile_inventory_sessions')
    .update(updates).eq('id', id).eq('business_id', existing.business_id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session });
}

export const GET = withErrorCapture('pos/mobile-session', _GET)
export const POST = withErrorCapture('pos/mobile-session', _POST)
export const PATCH = withErrorCapture('pos/mobile-session', _PATCH)
