export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  try {
    const { data: sessions, error } = await supabase
      .from('pos_cash_sessions')
      .select('*')
      .eq('business_id', bid)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (sessions ?? []).map(s => {
      const expected_cash = (s.opening_float ?? 0) + (s.total_cash_sales ?? 0);
      const variance = (s.closing_float ?? 0) - expected_cash;
      const opened = s.opened_at ? new Date(s.opened_at) : null;
      const closed = s.closed_at ? new Date(s.closed_at) : null;
      const duration_mins = opened && closed
        ? Math.round((closed.getTime() - opened.getTime()) / 60000)
        : null;
      return {
        ...s,
        expected_cash,
        variance,
        duration_mins,
        total_revenue: (s.total_cash_sales ?? 0) + (s.total_card_sales ?? 0),
      };
    });

    return NextResponse.json({ closures: rows, sessions: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
