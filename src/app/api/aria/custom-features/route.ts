export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const business_id = searchParams.get('business_id');
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

    const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
    if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('business_features')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ features: data ?? [] });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'aria/custom-features' } });
    return NextResponse.json({ features: [], error: 'internal' }, { status: 200 });
  }
}

export const GET = withErrorCapture('aria/custom-features', _GET)
