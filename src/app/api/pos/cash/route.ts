export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ entries: [] });

  const { data: entries, error: movErr } = await supabase
    .from('pos_cash_movements')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(100);

  if (movErr?.code === '42P01') return NextResponse.json({ entries: [] });

  return NextResponse.json({ entries: entries || [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { type, amount, note } = await req.json();
  if (!type || !amount) return NextResponse.json({ error: 'type and amount required' }, { status: 400 });

  const { data: entry, error } = await supabase
    .from('pos_cash_movements')
    .insert({ business_id: bid, type, amount, note: note ?? null })
    .select()
    .single();

  if (error?.code === '42P01') return NextResponse.json({ entry: null, warning: 'pos_cash_movements table not yet created' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry });
}

export const GET = withErrorCapture('pos/cash', _GET)
export const POST = withErrorCapture('pos/cash', _POST)
