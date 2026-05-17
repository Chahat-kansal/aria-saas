export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { pin, business_id, action, required_flag } = body;
  if (!pin || !business_id) {
    return NextResponse.json({ error: 'pin and business_id required' }, { status: 400 });
  }

  // Find a manager/owner/admin with this PIN (plain PIN comparison — table uses plain PIN)
  const { data: manager } = await supabase
    .from('pos_users')
    .select('id, name, role, permissions')
    .eq('business_id', business_id)
    .eq('pin', String(pin))
    .eq('is_active', true)
    .in('role', ['owner', 'admin', 'manager'])
    .maybeSingle();

  if (!manager) {
    return NextResponse.json({ authorized: false, error: 'Invalid manager PIN' }, { status: 403 });
  }

  // Write audit row for manager override
  try {
    const { writeAuditLog } = await import('@/lib/pos/check-permission')
    await writeAuditLog(supabase, {
      business_id,
      action: 'manager_override',
      manager_approved_by: manager.id,
      performed_by: user.id,
      metadata: { override_action: action ?? null, required_flag: required_flag ?? null },
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({
    authorized: true,
    manager: { id: manager.id, name: manager.name, role: manager.role },
    action,
  });
}

export const POST = withErrorCapture('pos/users/verify-override', _POST)
