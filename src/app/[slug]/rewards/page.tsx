export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { RewardsClient, type RewardRule } from './RewardsClient'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

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

  const [rulesRes] = await Promise.all([
    supabaseAdmin
      .from('loyalty_reward_rules')
      .select('id, name, description, threshold_value, reward_type, image_url, is_active')
      .eq('business_id', bid)
      .eq('is_active', true)
      .order('threshold_value', { ascending: true })
      .limit(12),
  ])

  const rules: RewardRule[] = (rulesRes.data ?? []) as RewardRule[]

  return (
    <RewardsClient
      slug={slug}
      bizName={(biz.name as string) ?? ''}
      logoUrl={(biz.logo_url as string | null) ?? null}
      rewardRules={rules}
    />
  )
}