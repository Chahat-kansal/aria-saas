import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
}

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, session.user.id);
  if (!bid) return NextResponse.json({ settings: null });

  const { data } = await supabase.from('pos_settings').select('*').eq('business_id', bid).maybeSingle();
  return NextResponse.json({ settings: data });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, session.user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
  const { data: existing } = await supabase.from('pos_settings').select('id').eq('business_id', bid).maybeSingle();

  let error;
  if (existing) {
    ({ error } = await supabase.from('pos_settings').update(body).eq('business_id', bid));
  } else {
    ({ error } = await supabase.from('pos_settings').insert({ ...body, business_id: bid }));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}