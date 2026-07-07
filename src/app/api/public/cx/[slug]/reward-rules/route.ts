export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

const RULE_LABELS: Record<string, { name: string; desc: (pts: number, threshold: number | null) => string }> = {
  spend_threshold:   { name: 'Spending reward',   desc: (pts, t) => 'Earn ' + pts + ' pts when you spend $' + (Number(t) || 0).toFixed(0) + ' or more' },
  visit_count:       { name: 'Visit milestone',    desc: (pts, t) => 'Earn ' + pts + ' pts on your ' + (Number(t) || 0) + 'th visit' },
  category_purchase: { name: 'Category bonus',     desc: (pts)    => 'Earn ' + pts + ' bonus pts on select items' },
  birthday_visit:    { name: 'Birthday treat',     desc: (pts)    => 'Earn ' + pts + ' pts on your birthday' },
  review_left:       { name: 'Review reward',      desc: (pts)    => 'Leave a review and earn ' + pts + ' pts' },
  referral_made:     { name: 'Referral bonus',     desc: (pts)    => 'Earn ' + pts + ' pts for each referral' },
  fifth_visit:       { name: 'Fifth-visit bonus',  desc: (pts)    => 'Earn ' + pts + ' pts on every 5th visit' },
  spending_milestone:{ name: 'Milestone reward',   desc: (pts, t) => 'Earn ' + pts + ' pts when you reach $' + (Number(t) || 0).toFixed(0) + ' total spend' },
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ reward_rules: [] }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('loyalty_reward_rules')
    .select('id, rule_type, points_value, threshold_value, is_active')
    .eq('business_id', bid)
    .eq('is_active', true)
    .order('created_at')

  if (error) return NextResponse.json({ reward_rules: [] })

  const reward_rules = (data ?? []).map(r => {
    const pts = Number(r.points_value ?? 0)
    const t = r.threshold_value
    const meta = RULE_LABELS[r.rule_type as string] ?? { name: r.rule_type, desc: (p: number) => 'Earn ' + p + ' pts' }
    return {
      id: r.id as string,
      rule_type: r.rule_type as string,
      name: meta.name,
      description: meta.desc(pts, t as number | null),
      points_value: pts,
      threshold_value: t,
    }
  })

  return NextResponse.json({ reward_rules })
}