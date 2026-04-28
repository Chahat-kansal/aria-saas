export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

  const { data: sales } = await supabase
    .from('pos_sales')
    .select('total_amount, created_at')
    .eq('business_id', business_id)
    .gte('created_at', ninetyDaysAgo);

  if (!sales || sales.length < 30) {
    return NextResponse.json({ days: [], insufficient_data: true, message: 'Need at least 30 sales for slow day analysis.' });
  }

  // Group by day of week
  const dowRevenue: Record<number, number[]> = {};
  for (const sale of sales) {
    const dow = new Date(sale.created_at).getDay();
    if (!dowRevenue[dow]) dowRevenue[dow] = [];
    dowRevenue[dow].push(Math.round((sale.total_amount ?? 0) * 100));
  }

  const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const overallTotal = Object.values(dowRevenue).flat().reduce((a, b) => a + b, 0);
  const overallAvg = overallTotal / Math.max(sales.length, 1);

  const days = Object.entries(dowRevenue).map(([dow, vals]) => {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const pct = overallAvg > 0 ? Math.round((avg / overallAvg) * 100) : 100;
    return { day: DOW_NAMES[parseInt(dow)], avg: Math.round(avg), pct };
  }).sort((a, b) => a.avg - b.avg);

  return NextResponse.json({ days, insufficient_data: false });
}
