export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, name, pin, role, permissions, is_active, manager_pin } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (pin && !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (pin !== undefined) updates.pin = pin;
  if (role !== undefined) updates.role = role;
  if (permissions !== undefined) updates.permissions = permissions;
  if (is_active !== undefined) updates.is_active = is_active;
  if (manager_pin !== undefined) updates.manager_pin = manager_pin;

  const { data, error } = await supabase
    .from('pos_users')
    .update(updates)
    .eq('id', params.id)
    .eq('business_id', business_id)
    .select('id, business_id, name, role, permissions, is_active, last_login_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}

async function _DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Deactivate rather than delete
  await supabase.from('pos_users').update({ is_active: false }).eq('id', params.id).eq('business_id', business_id);
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorCapture('pos/users/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/users/[id]', _DELETE)
