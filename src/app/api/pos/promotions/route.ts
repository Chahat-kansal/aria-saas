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

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ promotions: [] });
  try {
    const { data, error } = await supabase
      .from('pos_promotions')
      .select('*')
      .eq('business_id', bid)
      .order('created_at', { ascending: false });
    if (error) {
      // Table may not exist yet — return empty gracefully
      if (error.code === '42P01') return NextResponse.json({ promotions: [], table_missing: true });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ promotions: data ?? [] });
  } catch {
    return NextResponse.json({ promotions: [] });
  }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  try {
    const body = await req.json();
    // DB column is promotion_type — accept that directly, or fall back to legacy keys
    const promotion_type = body.promotion_type ?? body.discount_type ?? body.type ?? 'percentage_discount';
    const payload: Record<string, unknown> = {
      ...body,
      business_id: bid,
      promotion_type,
    };
    // Remove legacy/conflicting keys that don't exist in DB
    delete payload.type;
    delete payload.discount_type;
    delete payload.is_active; // DB uses 'active', not 'is_active'
    if (body.is_active !== undefined && payload.active === undefined) {
      payload.active = body.is_active;
    }

    const { data, error } = await supabase
      .from('pos_promotions')
      .insert(payload)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ promotion: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const body = await req.json();
    // Normalise field names: DB uses 'active' not 'is_active', 'promotion_type' not 'discount_type'
    delete body.type;
    delete body.discount_type;
    if (body.is_active !== undefined && body.active === undefined) {
      body.active = body.is_active;
    }
    delete body.is_active;
    if (body.promotion_type === undefined && (body as Record<string, unknown>).discount_type) {
      body.promotion_type = (body as Record<string, unknown>).discount_type;
    }
    const { error } = await supabase.from('pos_promotions').update(body).eq('id', id).eq('business_id', bid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabase.from('pos_promotions').delete().eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/promotions', _GET)
export const POST = withErrorCapture('pos/promotions', _POST)
export const PATCH = withErrorCapture('pos/promotions', _PATCH)
export const DELETE = withErrorCapture('pos/promotions', _DELETE)
