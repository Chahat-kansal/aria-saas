export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

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
  if (!bid) return NextResponse.json({ parked_sales: [] });

  const { data } = await supabase
    .from('pos_parked_sales')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: false });

  return NextResponse.json({ parked_sales: data || [] });
}

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { label, items, customer_id, subtotal, total } = await req.json();

  const { data, error } = await supabase
    .from('pos_parked_sales')
    .insert({ business_id: bid, label: label || null, items: items || [], customer_id: customer_id || null, subtotal: subtotal || 0, total: total || 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ parked_sale: data });
}

async function _DELETE(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await supabase.from('pos_parked_sales').delete().eq('id', id).eq('business_id', bid);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/park', _GET)
export const POST = withBusinessContext('pos/park', _POST)
export const DELETE = withBusinessContext('pos/park', _DELETE)
