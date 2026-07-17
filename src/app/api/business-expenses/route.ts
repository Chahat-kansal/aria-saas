export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture';

interface ExpenseInput { label: string; amount: number | string }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ expenses: [] });

  const { data } = await supabase.from('business_expenses')
    .select('id, label, amount, sort_order')
    .eq('business_id', bid)
    .order('sort_order', { ascending: true });

  return NextResponse.json({ expenses: data ?? [] });
}

async function _PUT(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({}));
  const incoming = Array.isArray(body.expenses) ? body.expenses as ExpenseInput[] : [];

  // Replace-all semantics: delete then insert
  await supabaseAdmin.from('business_expenses').delete().eq('business_id', bid);
  if (incoming.length === 0) return NextResponse.json({ expenses: [] });

  const rows = incoming
    .filter(e => typeof e.label === 'string' && e.label.trim().length > 0)
    .map((e, i) => ({
      business_id: bid,
      label: e.label.trim().slice(0, 80),
      amount: Number(e.amount) || 0,
      sort_order: i,
    }));
  if (rows.length === 0) return NextResponse.json({ expenses: [] });

  const { data, error } = await supabaseAdmin.from('business_expenses')
    .insert(rows).select('id, label, amount, sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenses: data ?? [] });
}

export const GET = withErrorCapture('business-expenses', _GET);
export const PUT = withBusinessContext('business-expenses', _PUT);
