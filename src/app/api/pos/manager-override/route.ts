export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { business_id, manager_pin, action, context } = body
  if (!business_id || !manager_pin || !action) {
    return NextResponse.json({ error: 'business_id, manager_pin, and action required' }, { status: 400 })
  }

  // Find active manager/admin with matching manager_pin
  const { data: managers } = await supabaseAdmin
    .from('pos_users')
    .select('id, name, role, permissions, manager_pin')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .in('role', ['owner', 'manager'])

  const approver = managers?.find(m =>
    m.manager_pin === manager_pin &&
    (m.permissions?.can_unlock_functions === true || m.role === 'owner')
  )

  if (!approver) {
    return NextResponse.json({ error: 'Invalid manager PIN or insufficient permissions' }, { status: 403 })
  }

  // Log to pos_audit_log
  await supabaseAdmin.from('pos_audit_log').insert({
    business_id,
    action,
    reason_code: 'manager_override',
    reason_note: context ?? null,
    performed_by: approver.name,
    manager_approved_by: approver.name,
    pos_user_id: approver.id,
    created_at: new Date().toISOString(),
  })

  return NextResponse.json({ approved: true, approver_name: approver.name, approver_id: approver.id })
}

export const POST = withErrorCapture('pos/manager-override', _POST)
