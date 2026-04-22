import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, session.user.id);
  if (!bid) return NextResponse.json({ customers: [] });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  let query = supabase
    .from('pos_customers')
    .select('*')
    .eq('business_id', bid)
    .order('name');

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: customers, error } = await query.limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: customers || [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, session.user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { name, email, phone } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { data: customer, error } = await supabase
    .from('pos_customers')
    .insert({ business_id: bid, name, email: email || null, phone: phone || null, loyalty_points: 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer });
}