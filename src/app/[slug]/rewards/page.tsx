export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { RewardsClient, type RewardRule } from './RewardsClient'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

type RawRule = {
  id: string
  rule_type: string | null
  threshold_value: number | null
  is_active: boolean
  config: { name?: string; description?: string; image_url?: string; product_id?: string } | null
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

  const { data: raw } = await supabaseAdmin
    .from('loyalty_reward_rules')
    .select('id, rule_type, threshold_value, is_active, config')
    .eq('business_id', bid)
    .eq('is_active', true)
    .order('threshold_value', { ascending: true })
    .limit(12)

  const rules: RewardRule[] = ((raw ?? []) as RawRule[]).map(r => ({
    id: r.id,
    name: r.config?.name ?? r.rule_type ?? 'Reward',
    description: r.config?.description ?? null,
    threshold_value: r.threshold_value !== null ? Number(r.threshold_value) : null,
    reward_type: r.rule_type ?? null,
    image_url: r.config?.image_url ?? null,
    is_active: r.is_active ?? true,
  }))

  return (
    <RewardsClient
      slug={slug}
      bizName={(biz.name as string) ?? ''}
      logoUrl={(biz.logo_url as string | null) ?? null}
      rewardRules={rules}
    />
  )
}