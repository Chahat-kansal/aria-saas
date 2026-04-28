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

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: e } = await supabase
    .from('reviews')
    .select('*')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ reviews: data ?? [] });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { data: review } = await supabase.from('reviews').select('business_id').eq('id', id).single();
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', review.business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error: e } = await supabase.from('reviews').update(body).eq('id', id);
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
