import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

// ACCESS-MODEL-1 — role resolution + the server-side capability gate.
//
// TWO-DEFENCE PATTERN (MANAGER-AGENT-1's bar): RLS admits a member to the 5 widened tables at the
// DATABASE layer; this module rejects out-of-role ACTIONS at the SERVER layer. Neither is UI —
// hiding a button is not enforcement, and a manager POSTing directly must fail regardless.
//
// OWNER is businesses.user_id. A MEMBER is a pos_users row with auth_user_id set. They are
// different columns on different tables: pos_users' own RLS stays owner-only, so a member cannot
// read or write membership rows at all — including their own. There is no path from member to
// owner. That is proof (5), enforced structurally rather than by a check someone could forget.

export type AppRole = 'owner' | 'manager'

export interface Membership {
  role: AppRole
  /** The existing ~30-flag POS permission model, reused — not a parallel permission system. */
  permissions: Record<string, unknown>
  is_owner: boolean
}

/**
 * Resolve who this auth user is for this business. Uses supabaseAdmin deliberately: the OWNER test
 * reads businesses.user_id and the MEMBER test reads pos_users, whose RLS is owner-only — a member
 * asking "what am I?" through their own client would get zero rows and appear unauthorised.
 */
export async function resolveMembership(userId: string, businessId: string): Promise<Membership | null> {
  // OWNER first — businesses.user_id is the sole definition of ownership.
  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('id', businessId).eq('user_id', userId).maybeSingle()
  if (biz) return { role: 'owner', permissions: {}, is_owner: true }

  const { data: member } = await supabaseAdmin
    .from('pos_users').select('role, permissions, is_active')
    .eq('business_id', businessId).eq('auth_user_id', userId).eq('is_active', true)
    .maybeSingle()
  if (!member) return null

  const role = String(member.role ?? '')
  if (role !== 'owner' && role !== 'manager') return null // cashier/staff are not owner-app users

  // A LINKED 'owner'-role pos_users row is still a MEMBER, never the business owner. is_owner
  // stays false so it can never clear an owner-only gate (money step-up, invite/revoke).
  return { role: role as AppRole, permissions: (member.permissions as Record<string, unknown>) ?? {}, is_owner: false }
}

/** Domains a non-owner member may act on. Money is deliberately absent — see requireDecisionAction. */
const MEMBER_ACTIONABLE_DOMAINS = new Set(['people', 'growth', 'supply', 'compliance'])

/**
 * The capability gate for acting on a decision. Returns a Response to short-circuit, or null when
 * allowed — the verifyBusinessAccess/verifyCronAuth convention already used across this codebase.
 *
 * MANAGER + MONEY (confirmed rule): a money decision is VISIBLE to a manager read-only — they see
 * the amount as context — but ANY action on it is rejected here, server-side. Money approval stays
 * owner-only and still requires the owner's step-up (PH-1), which this does not touch or weaken.
 */
export function requireDecisionAction(
  membership: Membership | null,
  decision: { domain?: string | null; requires_stepup?: boolean | null },
): NextResponse | null {
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (membership.is_owner) return null // the owner may act on everything, unchanged

  const domain = String(decision.domain ?? '')

  // Money is owner-only regardless of role or flags.
  if (domain === 'money') {
    return NextResponse.json({
      error: 'owner_only',
      reason: 'Money decisions can only be approved by the business owner.',
      domain,
    }, { status: 403 })
  }

  // A step-up decision is owner-bound by definition — step-up is the owner's identity check.
  if (decision.requires_stepup) {
    return NextResponse.json({
      error: 'owner_only',
      reason: 'This decision requires the owner\'s step-up verification.',
    }, { status: 403 })
  }

  if (!MEMBER_ACTIONABLE_DOMAINS.has(domain)) {
    return NextResponse.json({ error: 'out_of_role', domain }, { status: 403 })
  }
  return null
}

/** Invite/revoke/role-change are owner-only authority actions — a manager can never widen access. */
export function requireOwner(membership: Membership | null): NextResponse | null {
  if (!membership?.is_owner) {
    return NextResponse.json({ error: 'owner_only', reason: 'Only the business owner can manage access.' }, { status: 403 })
  }
  return null
}
