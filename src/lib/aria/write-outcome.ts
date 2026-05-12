import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function writeAriaOutcome(
  businessId: string,
  recommendationType: string,
  detail: string
): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()
    await supabase.from('aria_outcomes').insert({
      business_id:            businessId,
      recommendation_type:    recommendationType,
      recommendation_detail:  detail.slice(0, 1000),
      recommended_at:         new Date().toISOString(),
      acted_on:               false,
    })
  } catch {
    // Non-fatal — never let outcome writing break the route
  }
}
