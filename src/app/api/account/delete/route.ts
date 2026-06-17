export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (body.confirm !== 'DELETE MY DATA') {
    return NextResponse.json({ error: 'Confirmation required: send { confirm: "DELETE MY DATA" }' }, { status: 400 })
  }

  // DELETE-RIGHTS-FIX: purge through the sanctioned SECURITY DEFINER path. purge_account_data()
  // derives the owner from auth.uid() (the verified session above), sets a transaction-local flag
  // that protect_critical_data honours, then removes only the caller's OWN business data across the
  // guarded tables — atomically and FK-safe (children before parents). Called via the user-scoped
  // client so auth.uid() resolves; it can never touch another owner's data. Replaces the prior
  // per-table service-role deletes, which the hard-delete guard blocked at the first guarded table.
  const { data: deletedIds, error: purgeErr } = await supabase.rpc('purge_account_data')
  if (purgeErr) {
    return NextResponse.json({ error: 'Failed to delete account data: ' + purgeErr.message }, { status: 500 })
  }
  const businessIds = (deletedIds as string[] | null) ?? []

  // SEC-4 Part 5 — record the deletion (business_id null so the audit row survives the cascade)
  await supabaseAdmin.from('deletion_audit_log').insert({
    table_name: 'businesses',
    row_id: null,
    action: 'account_delete',
    old_data: { user_id: user.id, email: user.email ?? null, business_ids: businessIds },
    performed_by: user.id,
    business_id: null,
    reason: 'owner_requested_account_deletion',
    performed_at: new Date().toISOString(),
  })

  await supabaseAdmin.auth.admin.deleteUser(user.id)

  return NextResponse.json({ deleted: true })
}

export const DELETE = withErrorCapture('account/delete', _DELETE)
// SEC-4 — also expose as POST per spec (same confirmation-gated handler)
export const POST = withErrorCapture('account/delete', _DELETE)
