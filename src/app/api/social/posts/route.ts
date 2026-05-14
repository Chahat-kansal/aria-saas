export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const status      = searchParams.get('status');
  const from        = searchParams.get('from');
  const to          = searchParams.get('to');

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let query = supabase
    .from('social_posts')
    .select('id, platform, caption, hashtags, image_url, image_prompt, status, approval_status, scheduled_for, published_at, owner_request, aria_reasoning, reel_concept, reel_script, created_at')
    .eq('business_id', business_id)
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (from)   query = query.gte('scheduled_for', from);
  if (to)     query = query.lte('scheduled_for', to);

  const { data: posts, error } = await query.limit(100);
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ posts: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ posts: posts ?? [] });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, scheduled_for, caption, approval_status } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Verify ownership via business join
  const { data: post } = await supabase
    .from('social_posts')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', id)
    .single();

  if (!post || (post as any).businesses?.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (scheduled_for !== undefined) {
    updates.scheduled_for = scheduled_for;
    updates.status = scheduled_for ? 'scheduled' : 'draft';
    // Owner scheduling their own post → auto-approve so publish cron picks it up
    if (scheduled_for) updates.approval_status = 'approved';
  }
  if (caption       !== undefined) updates.caption = caption;
  if (approval_status !== undefined) updates.approval_status = approval_status;

  const { data: updated, error } = await supabase
    .from('social_posts').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: updated });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: post } = await supabase
    .from('social_posts')
    .select('id, status, businesses!inner(user_id)')
    .eq('id', id)
    .single();

  if (!post || (post as any).businesses?.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (post.status === 'published') {
    return NextResponse.json({ error: 'Cannot delete published posts' }, { status: 400 });
  }

  await supabase.from('social_posts').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}

export const GET    = withErrorCapture('social/posts', _GET)
export const PATCH  = withErrorCapture('social/posts', _PATCH)
export const DELETE = withErrorCapture('social/posts', _DELETE)