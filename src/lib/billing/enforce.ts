import { NextResponse } from 'next/server'
import { getEntitlement } from '@/lib/billing/entitlement'
import { logAICallSafe } from '@/lib/aria/log-ai-call'

// SS-RECONCILE — getEntitlement().sections is now the SOLE entitlement truth (founder decision
// (a), locked 2026-07-28): a feature is allowed iff the Sidebar section it lives in is in the
// business's entitled sections. feature_flags retires as an enforcement input — this is the
// minimal server check the 6 previously flag-gated routes now call, standing in for SS-3's
// eventual formal requireEntitlement wrapper (not yet built) so there is ONE check here, not six
// reimplementations, same canon-rail-lesson SS-1's getEntitlement() itself followed.
export async function hasSection(business_id: string, section: string): Promise<boolean> {
  const entitlement = await getEntitlement(business_id)
  return entitlement.sections.includes(section)
}

/**
 * SERVER ENFORCEMENT. Returns a 403 Response when the business's entitled sections don't include
 * `section`, or null when allowed. Mirrors the retired requireFeature()'s shape/logging
 * (agent_key='plan_gate') so denial telemetry stays consistent for anything reading it.
 *   const denied = await requireSection(bid, 'Warehouse'); if (denied) return denied;
 */
export async function requireSection(business_id: string, section: string): Promise<NextResponse | null> {
  const entitlement = await getEntitlement(business_id)
  if (entitlement.sections.includes(section)) return null
  logAICallSafe({
    business_id,
    agent_key: 'plan_gate',
    role: 'other',
    provider: 'other',
    success: false,
    request_summary: JSON.stringify({ denied_section: section, current_plan: entitlement.plan_key }),
  }).catch(() => {})
  return NextResponse.json({ error: 'upgrade_required', section, currentPlan: entitlement.plan_key }, { status: 403 })
}
