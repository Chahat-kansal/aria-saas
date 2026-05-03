export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, user_id, pin } = body;
  if (!business_id || !user_id || !pin) {
    return NextResponse.json({ error: 'business_id, user_id, pin required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: posUser } = await supabase
    .from('pos_users')
    .select('id, name, role, permissions, pin')
    .eq('id', user_id)
    .eq('business_id', business_id)
    .eq('is_active', true)
    .single();

  if (!posUser) return NextResponse.json({ valid: false, user: null });

  const valid = posUser.pin === pin;

  if (valid) {
    await supabase.from('pos_users').update({ last_login_at: new Date().toISOString() }).eq('id', user_id);
    // Return user without PIN
    const { pin: _pin, ...safeUser } = posUser;
    return NextResponse.json({ valid: true, user: safeUser });
  }

  return NextResponse.json({ valid: false, user: null });
}
