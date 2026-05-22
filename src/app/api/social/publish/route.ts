export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { post_id, business_id } = await req.json();
  if (!post_id || !business_id) return NextResponse.json({ error: 'post_id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: post } = await supabase.from('social_posts').select('*')
    .eq('id', post_id).eq('business_id', business_id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  // Allow publishing draft or approved posts — both are valid
  if (post.status === 'published') return NextResponse.json({ error: 'Already published' }, { status: 400 });

  const { data: conn } = await supabase.from('social_connections').select('*')
    .eq('business_id', business_id).eq('platform', post.platform).maybeSingle();
  if (!conn) return NextResponse.json({ error: `${post.platform} not connected` }, { status: 400 });

  const fullCaption = post.caption + (post.hashtags?.length
    ? '\n\n' + (post.hashtags as string[]).map((h: string) => `#${h}`).join(' ')
    : '');

  let platformPostId: string | null = null;
  let publishError: string | null = null;

  try {
    if (post.platform === 'facebook') {
      const fbUrl = post.image_url
        ? `https://graph.facebook.com/v19.0/${conn.platform_page_id}/photos`
        : `https://graph.facebook.com/v19.0/${conn.platform_page_id}/feed`;
      const fbBody = post.image_url
        ? { caption: fullCaption, url: post.image_url, access_token: conn.access_token }
        : { message: fullCaption, access_token: conn.access_token };
      const fbRes = await fetch(fbUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fbBody),
      });
      const fbData = await fbRes.json();
      if (fbData.error) throw new Error(fbData.error.message);
      platformPostId = fbData.post_id || fbData.id || null;

    } else if (post.platform === 'instagram') {
      if (!post.image_url) throw new Error('Instagram requires an image URL');
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${conn.instagram_account_id}/media`,
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: post.image_url, caption: fullCaption, access_token: conn.access_token }),
        }
      );
      const { id: creationId, error: cErr } = await containerRes.json();
      if (cErr) throw new Error(cErr.message);
      const publishRes = await fetch(
        `https://graph.facebook.com/v19.0/${conn.instagram_account_id}/media_publish`,
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: creationId, access_token: conn.access_token }),
        }
      );
      const pubData = await publishRes.json();
      if (pubData.error) throw new Error(pubData.error.message);
      platformPostId = pubData.id || null;

    } else if (post.platform === 'google_business') {
      const gbRes = await fetch(
        `https://mybusiness.googleapis.com/v4/accounts/${conn.platform_account_id}/locations/${conn.platform_page_id}/localPosts`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${conn.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ languageCode: 'en-AU', summary: post.caption, topicType: 'STANDARD' }),
        }
      );
      const gbData = await gbRes.json();
      if (gbData.error) throw new Error(JSON.stringify(gbData.error));
      platformPostId = gbData.name || null;
    }
  } catch (err: any) {
    publishError = err.message;
    console.error('[social/publish] platform error:', post.platform, err.message);
  }

  await supabase.from('social_posts').update({
    status: publishError ? 'failed' : 'published',
    published_at: publishError ? null : new Date().toISOString(),
    platform_post_id: platformPostId,
  }).eq('id', post_id);

  if (publishError) {
    console.error('[social/publish] failed:', post.platform, publishError);
    return NextResponse.json({ error: publishError }, { status: 502 });
  }
  console.log('[social/publish] success:', post.platform, platformPostId);
  return NextResponse.json({ ok: true, platform_post_id: platformPostId });
}

export const POST = withErrorCapture('social/publish', _POST)
