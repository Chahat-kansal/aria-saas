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

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase.from('aria_competitor_alerts')
    .select('id, competitor_name, alert_type, message, data, is_read, read, created_at')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })
    .limit(100);

  return NextResponse.json({ alerts: data ?? [] });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  const body = await req.json().catch(() => ({}));
  if (id) {
    // Verify user owns the business this alert belongs to
    const { data: alert } = await supabase.from('aria_competitor_alerts').select('business_id').eq('id', id).maybeSingle();
    if (!alert) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: biz } = await supabase.from('businesses').select('id').eq('id', alert.business_id).eq('user_id', user.id).maybeSingle();
    if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await supabase.from('aria_competitor_alerts').update({ is_read: body.is_read ?? true, read: body.is_read ?? true }).eq('id', id);
    return NextResponse.json({ ok: true });
  }
  // Mark all as read for a business
  if (body.business_id && body.mark_all === true) {
    const { data: biz } = await supabase.from('businesses').select('id').eq('id', body.business_id).eq('user_id', user.id).maybeSingle();
    if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await supabase.from('aria_competitor_alerts').update({ is_read: true, read: true }).eq('business_id', body.business_id);
    return NextResponse.json({ ok: true, all: true });
  }
  return NextResponse.json({ error: 'id or mark_all required' }, { status: 400 });
}

export const GET = withErrorCapture('aria/competitor-alerts', _GET);
export const PATCH = withErrorCapture('aria/competitor-alerts', _PATCH);
