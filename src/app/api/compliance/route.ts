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

  // Store compliance state in a simple key-value table (compliance_items)
  const { data, error: e } = await supabase
    .from('compliance_items')
    .select('key, checked, updated_at')
    .eq('business_id', business_id);

  // If table doesn't exist, return empty (graceful degradation)
  if (e) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, key, checked } = await req.json();
  if (!business_id || !key) return NextResponse.json({ error: 'business_id and key required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: e } = await supabase
    .from('compliance_items')
    .upsert({ business_id, key, checked, updated_at: new Date().toISOString() }, { onConflict: 'business_id,key' });

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('compliance', _GET)
export const POST = withErrorCapture('compliance', _POST)
