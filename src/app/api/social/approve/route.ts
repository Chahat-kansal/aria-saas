export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { post_id, business_id, edited_caption, edited_hashtags, image_url, scheduled_for } = await req.json();
  if (!post_id || !business_id) return NextResponse.json({ error: 'post_id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const updates: Record<string, any> = {
    status: 'approved',
    approved_at: new Date().toISOString(),
  };
  if (edited_caption !== undefined) updates.caption = edited_caption;
  if (edited_hashtags !== undefined) updates.hashtags = edited_hashtags;
  if (image_url !== undefined) updates.image_url = image_url;
  if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for;

  const { data: post, error } = await supabase.from('social_posts')
    .update(updates)
    .eq('id', post_id)
    .eq('business_id', business_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post });
}

// Skip a post
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const post_id = searchParams.get('post_id');
  const business_id = searchParams.get('business_id');
  if (!post_id || !business_id) return NextResponse.json({ error: 'post_id and business_id required' }, { status: 400 });

  const { error } = await supabase.from('social_posts')
    .update({ status: 'skipped' })
    .eq('id', post_id)
    .eq('business_id', business_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const POST = withErrorCapture('social/approve', _POST)
export const DELETE = withErrorCapture('social/approve', _DELETE)
