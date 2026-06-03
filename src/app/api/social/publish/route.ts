export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { markBriefingStale } from '@/lib/aria/briefing-invalidate'

// Instagram requires a clean publicly accessible URL — proxy Pexels/external images to Supabase storage
async function ensurePublicImageUrl(imageUrl: string, postId: string): Promise<string> {
  // Already a Supabase storage URL — use as-is
  if (imageUrl.includes('supabase.co/storage')) return imageUrl;
  // Fetch the image and re-upload to Supabase storage
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error('Could not fetch image: ' + res.status);
    const buf = await res.arrayBuffer();
    const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
    const key = 'social-publish/' + postId + '.' + ext;
    const { error } = await supabaseAdmin.storage.from('reusable-images')
      .upload(key, buf, { contentType: 'image/' + ext, upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabaseAdmin.storage.from('reusable-images').getPublicUrl(key);
    return data.publicUrl;
  } catch (e: any) {
    console.error('[social/publish] image proxy failed, using original URL:', e.message);
    return imageUrl; // fallback to original — may fail on Instagram but at least we tried
  }
}

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
      const videoUrl = (post as any).video_url as string | null;
      const isReel = !!videoUrl;

      if (isReel) {
        // ── Instagram Reels via video_url ──────────────────────────────
        // Step 1: Create media container (REELS type)
        const containerRes = await fetch(
          `https://graph.facebook.com/v19.0/${conn.instagram_account_id}/media`,
          {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              media_type: 'REELS',
              video_url: videoUrl,
              caption: fullCaption,
              share_to_feed: true, // appears in feed + Reels tab
              access_token: conn.access_token,
            }),
          }
        );
        const { id: creationId, error: cErr } = await containerRes.json();
        if (cErr) throw new Error(cErr.message);
        if (!creationId) throw new Error('No creation_id from Instagram Reels container');

        // Step 2: Poll until container is READY (video processing takes ~15-30s)
        let ready = false;
        for (let attempt = 0; attempt < 12; attempt++) {
          await new Promise(r => setTimeout(r, 5000));
          const statusRes = await fetch(
            `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${conn.access_token}`
          );
          const statusData = await statusRes.json();
          if (statusData.status_code === 'FINISHED') { ready = true; break; }
          if (statusData.status_code === 'ERROR') throw new Error('Instagram video processing failed');
        }
        if (!ready) throw new Error('Instagram video container timed out');

        // Step 3: Publish
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

      } else {
        // ── Standard Instagram image post ──────────────────────────────
        if (!post.image_url) throw new Error('Instagram requires an image_url or video_url');
        const safeImageUrl = await ensurePublicImageUrl(post.image_url, post.id);
        console.log('[social/publish] instagram image_url:', safeImageUrl);
        const containerRes = await fetch(
          `https://graph.facebook.com/v19.0/${conn.instagram_account_id}/media`,
          {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: safeImageUrl, caption: fullCaption, access_token: conn.access_token }),
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
      }

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
  void markBriefingStale(business_id)
  return NextResponse.json({ ok: true, platform_post_id: platformPostId });
}

export const POST = withErrorCapture('social/publish', _POST)
