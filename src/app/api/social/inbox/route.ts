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
  if (!bid) return NextResponse.json({ messages: [] });

  const filter = new URL(req.url).searchParams.get('filter') ?? 'all';
  let q = supabase.from('social_inbox').select('*').eq('business_id', bid)
    .order('received_at', { ascending: false }).limit(100);
  if (filter === 'unread') q = q.eq('is_read', false);
  if (filter === 'replied') q = q.not('replied_at', 'is', null);
  const { data } = await q;
  return NextResponse.json({ messages: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const body = await req.json();
  const { data, error } = await supabase.from('social_inbox').insert({
    business_id: bid,
    platform: body.platform ?? 'unknown',
    message_type: body.message_type ?? 'comment',
    author_name: body.author_name ?? null,
    author_handle: body.author_handle ?? null,
    content: body.content ?? '',
    post_url: body.post_url ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}

// CANON-SEC-1 — no business-scoping existed on this update at all (id alone). social_inbox
// carries an RLS ALL policy scoped to business ownership WITH CHECK (social_inbox_owner), so on
// the RLS-scoped client a foreign id already matched zero rows — defense-in-depth-only. Explicit
// scoping added anyway; moving onto withBusinessContext is the fix and canonicalization in one act.
async function _PATCH(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (body.is_read !== undefined) patch.is_read = body.is_read;
  if (body.reply_text !== undefined) { patch.reply_text = body.reply_text; patch.replied_at = new Date().toISOString(); }
  await supabase.from('social_inbox').update(patch).eq('id', id).eq('business_id', bid);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('social/inbox', _GET);
export const POST = withErrorCapture('social/inbox', _POST);
export const PATCH = withBusinessContext('social/inbox', _PATCH);
