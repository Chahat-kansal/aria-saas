import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { runLiveMonitor } from '@/lib/aria/live-monitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const { business_id } = await req.json();
    if (!business_id) {
      return NextResponse.json({ error: 'business_id required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!biz) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const result = await runLiveMonitor(business_id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/aria/live-intelligence]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const business_id = req.nextUrl.searchParams.get('business_id');
  if (!business_id) {
    return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!biz) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }

  try {
    const result = await runLiveMonitor(business_id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/aria/live-intelligence]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
