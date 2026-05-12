export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const lapsedDays = searchParams.get('lapsed');
  const recentDays = searchParams.get('recent');
  const search = searchParams.get('q');

  let query = supabase.from('customers')
    .select('id, name, phone, email, last_visit, total_spend, visit_count, churn_risk')
    .eq('business_id', business_id)
    .order('last_visit', { ascending: false })
    .limit(100);

  if (lapsedDays) {
    const cutoff = new Date(Date.now() - parseInt(lapsedDays) * 86400000).toISOString();
    query = query.lt('last_visit', cutoff).order('last_visit', { ascending: true });
  }
  if (recentDays) {
    const cutoff = new Date(Date.now() - parseInt(recentDays) * 86400000).toISOString();
    query = query.gte('last_visit', cutoff);
  }
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error: e } = await query;
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ customers: data ?? [] });
}

export const GET = withErrorCapture('customers', _GET)
