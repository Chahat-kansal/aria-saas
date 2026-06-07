export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { computeSlowDay } from '@/lib/aria/slow-day'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const slowDayResult = await computeSlowDay(business_id)
  if (!slowDayResult) {
    return NextResponse.json({ days: [], insufficient_data: true, message: 'Need at least 10 sales to analyse slow days. Keep using the POS and this will populate automatically.' });
  }

  const overallAvgCents = Math.round(slowDayResult.overallDailyAvg * 100)
  const days = slowDayResult.all.map(d => {
    const avg = Math.round(d.avgRev * 100)
    const pct = overallAvgCents > 0 ? Math.round((avg / overallAvgCents) * 100) : 100
    return { day: d.name, avg, pct }
  })

  return NextResponse.json({ days, insufficient_data: false });
}

export const GET = withErrorCapture('aria/slow-day-analysis', _GET)
