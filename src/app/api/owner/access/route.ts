export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveMembership, requireOwner } from '@/lib/access/membership'

// ACCESS-MODEL-1 — invite / link / revoke. Managing who can see the business is itself an
// AUTHORITY action, so every method here is OWNER-ONLY (requireOwner) — a manager can never widen
// access, invite anyone, or change a role. That is what makes proof (5) hold end to end: not only
// can a member not become the owner, they cannot even grant themselves or anyone else a role.
//
// REUSE: the existing staff pipeline already models invitations (staff_invites: business_id,
// staff_member_id, email, token, status, invited_by, expires_at, accepted_at) and
// api/staff/portal/accept-invite already links an auth identity on acceptance. This route is the
// OWNER-APP-side link/revoke over the same pos_users membership primitive — it does not build a
// parallel invite system.
//
// AUDIT: every link/revoke/role-change writes activity_log (the existing human-audit trail PH-1
// already uses), so an access change is always traceable to who did it and when.

async function auditAccessChange(params: {
  business_id: string; actor_user_id: string; verb: 'link' | 'revoke' | 'role_change'
  subject_email?: string | null; subject_pos_user_id?: string | null; detail: string
}) {
  await supabaseAdmin.from('activity_log').insert({
    business_id: params.business_id,
    action_type: 'access_' + params.verb,
    description: params.detail,
    metadata: {
      actor_user_id: params.actor_user_id,
      verb: params.verb,
      subject_email: params.subject_email ?? null,
      subject_pos_user_id: params.subject_pos_user_id ?? null,
      source: 'owner_app',
    },
    created_at: new Date().toISOString(),
  })
}

// GET /api/owner/access?business_id=X — who currently has access (owner-only)
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const membership = await resolveMembership(user.id, business_id)
  const notOwner = requireOwner(membership)
  if (notOwner) return notOwner

  const { data: members } = await supabaseAdmin
    .from('pos_users')
    .select('id, name, display_name, role, is_active, auth_user_id, last_login_at')
    .eq('business_id', business_id).not('auth_user_id', 'is', null)
    .order('created_at', { ascending: true })

  return NextResponse.json({ members: members ?? [] })
}

// POST /api/owner/access { business_id, email, role } — link an existing auth user as a member
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { business_id?: string; email?: string; role?: string }
  const { business_id, email } = body
  const role = body.role === 'owner' ? 'owner' : 'manager'
  if (!business_id || !email?.trim()) {
    return NextResponse.json({ error: 'business_id and email are required' }, { status: 400 })
  }

  const membership = await resolveMembership(user.id, business_id)
  const notOwner = requireOwner(membership)
  if (notOwner) return notOwner

  // The invitee must already hold an auth identity (they sign up first, exactly as the existing
  // staff portal flow expects). We never create credentials on someone's behalf.
  const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers()
  const target = usersPage?.users.find(u => u.email?.toLowerCase() === email.trim().toLowerCase())
  if (!target) {
    return NextResponse.json({ error: 'no_account', reason: 'That email has no Aria account yet — ask them to sign up first.' }, { status: 404 })
  }

  // NOTE: role is 'owner'|'manager' as a MEMBERSHIP role only. It never touches businesses.user_id,
  // so even a member linked with role='owner' is not the business owner and cannot clear an
  // owner-only gate (resolveMembership returns is_owner:false for every linked member).
  // NOTE: the uniqueness index on (auth_user_id, business_id) is PARTIAL (WHERE auth_user_id IS
  // NOT NULL), which PostgREST's upsert cannot infer as a conflict target — an .upsert() here fails
  // with "no unique or exclusion constraint matching the ON CONFLICT specification" (caught while
  // proving this sprint). Explicit find-then-update/insert instead, which also makes re-linking a
  // previously-revoked person (auth_user_id was nulled on revoke) work correctly.
  const { data: existing } = await supabaseAdmin.from('pos_users')
    .select('id').eq('business_id', business_id).eq('auth_user_id', target.id).maybeSingle()

  let linkedId: string | null = existing?.id as string ?? null
  let error: { message: string } | null = null

  if (linkedId) {
    const { error: updErr } = await supabaseAdmin.from('pos_users')
      .update({ role, is_active: true }).eq('id', linkedId)
    error = updErr
  } else {
    const { data: inserted, error: insErr } = await supabaseAdmin.from('pos_users').insert({
      business_id,
      auth_user_id: target.id,
      name: target.email ?? email.trim(),
      display_name: target.email ?? email.trim(),
      role,
      pin: Math.floor(1000 + Math.random() * 9000).toString(), // pos_users.pin is NOT NULL (till model)
      is_active: true,
    }).select('id').maybeSingle()
    linkedId = (inserted?.id as string) ?? null
    error = insErr
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const linked = linkedId ? { id: linkedId } : null

  await auditAccessChange({
    business_id, actor_user_id: user.id, verb: 'link', subject_email: email.trim(),
    subject_pos_user_id: (linked?.id as string) ?? null,
    detail: 'Linked ' + email.trim() + ' as ' + role,
  })

  return NextResponse.json({ ok: true, member_id: linked?.id ?? null, role })
}

// DELETE /api/owner/access { business_id, pos_user_id } — revoke, effective immediately
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { business_id?: string; pos_user_id?: string }
  const { business_id, pos_user_id } = body
  if (!business_id || !pos_user_id) {
    return NextResponse.json({ error: 'business_id and pos_user_id are required' }, { status: 400 })
  }

  const membership = await resolveMembership(user.id, business_id)
  const notOwner = requireOwner(membership)
  if (notOwner) return notOwner

  // is_active=false is what is_business_member() tests, so RLS stops admitting them on the VERY
  // NEXT query — no cache to expire, no session to wait out. auth_user_id is cleared too so the
  // link itself is gone, not merely dormant.
  const { error } = await supabaseAdmin.from('pos_users')
    .update({ is_active: false, auth_user_id: null })
    .eq('id', pos_user_id).eq('business_id', business_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditAccessChange({
    business_id, actor_user_id: user.id, verb: 'revoke', subject_pos_user_id: pos_user_id,
    detail: 'Revoked owner-app access for member ' + pos_user_id,
  })

  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('owner/access', _GET)
export const POST = withErrorCapture('owner/access', _POST)
export const DELETE = withErrorCapture('owner/access', _DELETE)
