import { supabaseAdmin } from '@/lib/supabase-admin'

export async function seedOnboardingMemories(businessId: string): Promise<{ inserted: number }> {
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name,industry,owner_name,staff_count,monthly_revenue,biggest_challenge,address,city,plan')
    .eq('id', businessId)
    .maybeSingle()

  if (!biz) return { inserted: 0 }

  // Idempotency: skip if any onboarding memories already exist for this business
  const { data: existing } = await supabaseAdmin
    .from('aria_business_memory')
    .select('id')
    .eq('business_id', businessId)
    .eq('source_type', 'manual')
    .ilike('content', 'Onboarding:%')
    .limit(1)

  if (existing && existing.length > 0) return { inserted: 0 }

  const b = biz as Record<string, unknown>
  const seeds: Array<{
    business_id: string
    kind: string
    content: string
    topic: string | null
    source_type: string
    source_id: null
    confidence: number
    importance: number
  }> = []

  const add = (
    kind: string,
    content: string,
    topic: string | null,
    importance: number,
  ) => {
    seeds.push({
      business_id: businessId,
      kind,
      content: `Onboarding: ${content}`,
      topic,
      source_type: 'manual',
      source_id: null,
      confidence: 0.95,
      importance,
    })
  }

  // Core identity — always present
  const name = (b.name as string) ?? 'This business'
  const industry = (b.industry as string) ?? 'retail'
  const city = (b.city as string) ?? (b.address as string) ?? null

  if (city) {
    add('fact', `${name} is a ${industry} business located in ${city}`, null, 10)
  } else {
    add('fact', `${name} is a ${industry} business`, null, 10)
  }

  if (b.owner_name) {
    add('fact', `The business owner is ${b.owner_name as string}`, null, 9)
  }

  if (b.staff_count) {
    add('fact', `Staff count: ${b.staff_count as string}`, 'staff', 7)
  }

  if (b.monthly_revenue) {
    add('fact', `Approximate monthly revenue: ${b.monthly_revenue as string}`, 'cashflow', 8)
  }

  if (b.biggest_challenge) {
    add('concern', `Owner's biggest challenge is: ${b.biggest_challenge as string}`, null, 8)
  }

  if (b.plan) {
    add('fact', `Subscription plan: ${b.plan as string}`, null, 5)
  }

  if (seeds.length === 0) return { inserted: 0 }

  const { error } = await supabaseAdmin.from('aria_business_memory').insert(seeds)
  if (error) {
    console.error('[memory/seed] insert failed:', error.message)
    return { inserted: 0 }
  }
  return { inserted: seeds.length }
}
