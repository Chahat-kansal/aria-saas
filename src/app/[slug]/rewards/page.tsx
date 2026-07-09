export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { RewardsClient, type RewardRule } from './RewardsClient'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'

type RawRule = {
  id: string
  rule_type: string | null
  threshold_value: number | null
  is_active: boolean
  config: { name?: string; description?: string; image_url?: string; product_id?: string } | null
}

export type Challenge = {
  id: string
  title: string
  description: string | null
  target_count: number
  progress: number
  reward_points: number
  status: string
  expires_at: string | null
}

export default async function RewardsPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, slug, logo_url')
    .eq('id', bid)
    .maybeSingle()
  if (!biz) notFound()

  const [session, rawRulesRes, loyCfgRes] = await Promise.all([
    getCxSessionServer(bid),
    supabaseAdmin
      .from('loyalty_reward_rules')
      .select('id, rule_type, threshold_value, is_active, config')
      .eq('business_id', bid)
      .eq('is_active', true)
      .order('threshold_value', { ascending: true })
      .limit(12),
    supabaseAdmin
      .from('pos_loyalty_config')
      .select('program_enabled')
      .eq('business_id', bid)
      .maybeSingle(),
  ])

  const programEnabled: boolean =
    (loyCfgRes.data as { program_enabled?: boolean | null } | null)?.program_enabled ?? true

  const rules: RewardRule[] = ((rawRulesRes.data ?? []) as RawRule[]).map(r => ({
    id: r.id,
    name: r.config?.name ?? r.rule_type ?? 'Reward',
    description: r.config?.description ?? null,
    threshold_value: r.threshold_value !== null ? Number(r.threshold_value) : null,
    reward_type: r.rule_type ?? null,
    image_url: r.config?.image_url ?? null,
    is_active: r.is_active ?? true,
  }))

  let pts = 0
  let tier: string | null = null
  let customerId: string | null = null
  let challenges: Challenge[] = []

  if (session) {
    const { data: customer } = await supabaseAdmin
      .from('pos_customers')
      .select('id, points_balance, loyalty_tier')
      .eq('business_id', bid)
      .eq('loyalty_identity_id', session.identity_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (customer) {
      pts = Number((customer as { points_balance?: number | null }).points_balance) || 0
      tier = (customer as { loyalty_tier?: string | null }).loyalty_tier ?? null
      customerId = (customer as { id: string }).id
      const { data: chs } = await supabaseAdmin
        .from('loyalty_challenges')
        .select('id, title, description, target_count, progress, reward_points, status, expires_at')
        .eq('business_id', bid)
        .eq('customer_id', customerId)
        .not('status', 'eq', 'expired')
        .order('created_at', { ascending: false })
        .limit(5)
      challenges = (chs ?? []) as Challenge[]
    }
  }

  return (
    <RewardsClient
      slug={slug}
      bizName={(biz.name as string) ?? ''}
      logoUrl={(biz.logo_url as string | null) ?? null}
      rewardRules={rules}
      isSignedIn={!!session}
      pts={pts}
      tier={tier}
      customerId={customerId}
      challenges={challenges}
      programEnabled={programEnabled}
    />
  )
}