import { getAdminClient } from '@/lib/admin';

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
    if (flag.is_globally_enabled) return true;
    if ((flag.disabled_for_business_ids as string[])?.includes(business_id)) return false;
    if ((flag.enabled_for_business_ids as string[])?.includes(business_id)) return true;
    return (flag.enabled_for_plans as string[])?.includes(plan) ?? false;
  } catch {
    return false;
  }
}
