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
  const acknowledged = searchParams.get('acknowledged');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let query = supabase
    .from('intelligence_events')
    .select('*')
    .eq('business_id', business_id)
    .order('triggered_at', { ascending: false })
    .limit(limit);

  if (acknowledged === 'false') {
    query = query.eq('acknowledged', false);
  } else if (acknowledged === 'true') {
    query = query.eq('acknowledged', true);
  }

  const { data: events, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: events ?? [] });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id, business_id, acknowledged } = body;

  if (!id || !business_id) return NextResponse.json({ error: 'id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: updated, error } = await supabase
    .from('intelligence_events')
    .update({
      acknowledged: acknowledged ?? true,
      acknowledged_at: acknowledged !== false ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('business_id', business_id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: updated });
}

export const GET = withErrorCapture('intelligence-events', _GET)
export const PATCH = withErrorCapture('intelligence-events', _PATCH)
