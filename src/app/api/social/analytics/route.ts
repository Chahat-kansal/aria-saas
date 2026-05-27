export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

interface PostRow { id: string; platform: string; caption: string | null; image_url: string | null; published_at: string | null; created_at: string; impressions?: number | null; reach?: number | null; likes?: number | null; comments?: number | null; shares?: number | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ posts: [], summary: null });

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: posts } = await supabase.from('social_posts')
    .select('id, platform, caption, image_url, published_at, created_at, impressions, reach, likes, comments, shares')
    .eq('business_id', bid)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (posts ?? []) as PostRow[];
  const totals = rows.reduce((acc, p) => {
    acc.impressions += Number(p.impressions ?? 0);
    acc.reach += Number(p.reach ?? 0);
    acc.likes += Number(p.likes ?? 0);
    acc.comments += Number(p.comments ?? 0);
    acc.shares += Number(p.shares ?? 0);
    return acc;
  }, { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 });

  const engagementRate = totals.impressions > 0
    ? ((totals.likes + totals.comments + totals.shares) / totals.impressions) * 100
    : 0;

  // Top post by engagement
  const topPost = rows.length > 0 ? rows.map(p => ({
    ...p,
    engagement: Number(p.likes ?? 0) + Number(p.comments ?? 0) + Number(p.shares ?? 0),
  })).sort((a, b) => b.engagement - a.engagement)[0] : null;

  // Content type breakdown (image vs text)
  const byType = { image: 0, text: 0 };
  for (const p of rows) {
    if (p.image_url) byType.image += Number(p.likes ?? 0) + Number(p.comments ?? 0);
    else byType.text += Number(p.likes ?? 0) + Number(p.comments ?? 0);
  }

  return NextResponse.json({
    posts: rows,
    summary: { totals, engagement_rate: engagementRate, top_post: topPost, by_type: byType, count: rows.length },
  });
}

export const GET = withErrorCapture('social/analytics', _GET);
