export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const session_type = searchParams.get('type');
  const bid = business_id || await getBid(supabase, user.id);
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

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, session_type, notes } = await req.json();
  const bid = business_id || await getBid(supabase, user.id);
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

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { scanned_items, status, notes } = await req.json();
  const updates: Record<string, any> = {};
  if (scanned_items !== undefined) updates.scanned_items = scanned_items;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (status === 'completed') updates.completed_at = new Date().toISOString();

  const { data: session, error } = await supabase.from('mobile_inventory_sessions')
    .update(updates).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session });
}
