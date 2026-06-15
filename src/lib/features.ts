import { getAdminClient } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { getEffectivePlan, type Plan } from '@/lib/plans/resolve-plan';
import { logAICallSafe } from '@/lib/aria/log-ai-call';

export async function hasFeature(
  business_id: string,
  flag_key: string,
  plan: string
): Promise<boolean> {
  try {
    const db = getAdminClient();
    const { data: flag } = await db
      .from('feature_flags')
      .select('*')
      .eq('flag_key', flag_key)
      .maybeSingle();

    if (!flag) return false;
    // disabled list always wins, even over global enable
    if ((flag.disabled_for_business_ids as string[])?.includes(business_id)) return false;
    if (flag.is_globally_enabled) return true;
    if ((flag.enabled_for_business_ids as string[])?.includes(business_id)) return true;
    return (flag.enabled_for_plans as string[])?.includes(plan) ?? false;
  } catch {
    return false;
  }
}

/** SS — resolve a business's effective plan from the canonical source (businesses.plan). */
export async function getBusinessPlan(business_id: string): Promise<Plan> {
  try {
    const db = getAdminClient();
    const { data } = await db
      .from('businesses')
      .select('plan, subscription_status, trial_ends_at, stripe_subscription_id, plan_override_by')
      .eq('id', business_id)
      .maybeSingle();
    return getEffectivePlan(data ?? null);
  } catch {
    return 'starter';
  }
}

/** SS — flag check that resolves the plan itself (callers don't pass plan). */
export async function isFeatureEnabled(business_id: string, flag_key: string): Promise<boolean> {
  const plan = await getBusinessPlan(business_id);
  return hasFeature(business_id, flag_key, plan);
}

/**
 * SS — SERVER ENFORCEMENT. Returns a 403 Response when the business's effective plan lacks
 * the feature, or null when allowed (verifyCronAuth-style). Logs denials (agent_key='plan_gate').
 *   const denied = await requireFeature(bid, 'warehouse'); if (denied) return denied;
 */
export async function requireFeature(business_id: string, flag_key: string): Promise<NextResponse | null> {
  const plan = await getBusinessPlan(business_id);
  const ok = await hasFeature(business_id, flag_key, plan);
  if (ok) return null;
  logAICallSafe({
    business_id,
    agent_key: 'plan_gate',
    role: 'other',
    provider: 'other',
    success: false,
    request_summary: JSON.stringify({ denied_flag: flag_key, current_plan: plan }),
  }).catch(() => {});
  return NextResponse.json({ error: 'upgrade_required', flag: flag_key, currentPlan: plan }, { status: 403 });
}
