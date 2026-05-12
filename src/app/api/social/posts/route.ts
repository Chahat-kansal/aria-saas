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
  const status = searchParams.get('status');

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let query = supabase.from('social_posts').select('*')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data: posts, error } = await query.limit(50);
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

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { business_id, ...updates } = body;

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase.from('social_posts')
    .update(updates).eq('id', id).eq('business_id', business_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

export const GET = withErrorCapture('social/posts', _GET)
export const PATCH = withErrorCapture('social/posts', _PATCH)
