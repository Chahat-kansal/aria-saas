export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ assets: [] });
  const type = new URL(req.url).searchParams.get('type');
  let q = supabase.from('social_content_library').select('*').eq('business_id', bid)
    .order('created_at', { ascending: false }).limit(200);
  if (type) q = q.eq('asset_type', type);
  const { data } = await q;
  return NextResponse.json({ assets: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  if (!['image','caption','hashtag_set'].includes(body.asset_type)) {
    return NextResponse.json({ error: 'invalid asset_type' }, { status: 400 });
  }
  const { data, error } = await supabase.from('social_content_library').insert({
    business_id: bid,
    asset_type: body.asset_type,
    name: body.name ?? null,
    content: body.content ?? null,
    image_url: body.image_url ?? null,
    tags: body.tags ?? [],
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data });
}

// CANON-SEC-1 — no business-scoping existed on this delete at all (id alone). social_content_library
// carries an RLS ALL policy scoped to business ownership WITH CHECK (social_content_library_owner),
// so on the RLS-scoped client a foreign id already matched zero rows — defense-in-depth-only.
// Explicit scoping added anyway; moving onto withBusinessContext is the fix and canonicalization
// in one act.
async function _DELETE(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('social_content_library').delete().eq('id', id).eq('business_id', bid);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('social/library', _GET);
export const POST = withErrorCapture('social/library', _POST);
export const DELETE = withBusinessContext('social/library', _DELETE);
