export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const business_id = new URL(req.url).searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data } = await supabase.from('competitor_snapshots')
    .select('competitor_name, rating, review_count, snapshot_date')
    .eq('business_id', business_id)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });

  return NextResponse.json({ snapshots: data ?? [] });
}

export const GET = withErrorCapture('competitor-snapshots', _GET);
