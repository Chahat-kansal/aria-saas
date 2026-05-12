export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase
    .from('pos_users')
    // Never return PIN
    .select('id, business_id, name, role, permissions, is_active, last_login_at, created_at')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .order('name');

  return NextResponse.json({ users: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, name, pin, role = 'cashier', permissions } = body;

  if (!business_id || !name || !pin) {
    return NextResponse.json({ error: 'business_id, name, pin required' }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const defaultPermissions = {
    can_apply_discount: true,
    can_refund: role === 'manager' || role === 'owner',
    max_discount_pct: role === 'manager' || role === 'owner' ? 100 : 10,
    can_close_register: role !== 'cashier',
    can_override_price: role === 'manager' || role === 'owner',
  };

  const { data, error } = await supabase.from('pos_users').insert({
    business_id, name: name.trim(), pin, role,
    permissions: permissions ?? defaultPermissions,
  }).select('id, business_id, name, role, permissions, is_active, created_at').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data }, { status: 201 });
}

export const GET = withErrorCapture('pos/users', _GET)
export const POST = withErrorCapture('pos/users', _POST)
