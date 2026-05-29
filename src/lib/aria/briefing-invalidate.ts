import { supabaseAdmin } from '@/lib/supabase-admin'

export async function markBriefingStale(businessId: string): Promise<void> {
  await supabaseAdmin
    .from('businesses')
    .update({ requires_briefing_refresh: true })
    .eq('id', businessId)
}
