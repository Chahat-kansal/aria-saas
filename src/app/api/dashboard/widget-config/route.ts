import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getActiveBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business')
    .select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id')
    .eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getActiveBid(supabase, user.id);
  if (!bid) return NextResponse.json({ config: null });

  const { data } = await supabase.from('widget_configs').select('*').eq('business_id', bid).maybeSingle();
  return NextResponse.json({ config: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getActiveBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();

  const { data, error } = await supabase.from('widget_configs').upsert(
    { ...body, business_id: bid, updated_at: new Date().toISOString() },
    { onConflict: 'business_id' }
  ).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}

export const GET = withErrorCapture('dashboard/widget-config', _GET)
export const PATCH = withErrorCapture('dashboard/widget-config', _PATCH)
