export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

const TABLE_MAP: Record<string, string> = {
  brand: 'pos_brands',
  family: 'pos_families',
  tag: 'pos_tags',
};

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'brand';
  const table = TABLE_MAP[type];
  if (!table) return NextResponse.json({ error: 'Invalid type. Use: brand, family, tag' }, { status: 400 });

  const { data, error } = await supabase.from(table).select('*').eq('business_id', bid).order('name');
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ items: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const body = await req.json();
  const { type, name } = body;
  if (!type || !name) return NextResponse.json({ error: 'type and name required' }, { status: 400 });
  const table = TABLE_MAP[type];
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

  const { data, error } = await supabase.from(table).insert({ business_id: bid, name }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { type, id, name } = body;
  const table = TABLE_MAP[type];
  if (!table || !id) return NextResponse.json({ error: 'type and id required' }, { status: 400 });

  const { error } = await supabase.from(table).update({ name }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? '';
  const id   = searchParams.get('id') ?? '';
  const table = TABLE_MAP[type];
  if (!table || !id) return NextResponse.json({ error: 'type and id required' }, { status: 400 });

  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/classifications', _GET)
export const POST = withErrorCapture('pos/classifications', _POST)
export const PATCH = withErrorCapture('pos/classifications', _PATCH)
export const DELETE = withErrorCapture('pos/classifications', _DELETE)
