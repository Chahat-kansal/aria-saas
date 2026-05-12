export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
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

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ customers: [] });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const id = searchParams.get('id');

  // Fetch a single customer by ID
  if (id) {
    const { data: customer, error } = await supabase
      .from('pos_customers')
      .select('*')
      .eq('id', id)
      .eq('business_id', bid)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ customer: customer ?? null });
  }

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

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { name, email, phone, group_id, group_name, account_number } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { data: customer, error } = await supabase
    .from('pos_customers')
    .insert({ business_id: bid, name, email: email || null, phone: phone || null, loyalty_points: 0, group_id: group_id || null, group_name: group_name || null, account_number: account_number || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { error } = await supabase
    .from('pos_customers')
    .update(body)
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/customers', _GET)
export const POST = withErrorCapture('pos/customers', _POST)
export const PATCH = withErrorCapture('pos/customers', _PATCH)
