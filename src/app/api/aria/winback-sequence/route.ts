export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action'

interface SequenceStep {
  delay_days: number
  message: string
  condition: 'always' | 'if_not_returned'
}

type SeqRow = {
  id: string
  name: string | null
  status: string | null
  created_at: string
  recipients_count: number | null
  returned_customers: number | null
  roi_percent: number | null
  sequence_steps: SequenceStep[] | null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ sequences: [] })

  const { data: biz } = await supabase
    .from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ sequences: [] })

  const { data: raw } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('business_id', business_id)
    .eq('type', 'winback_sequence')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ sequences: (raw ?? []) as unknown as SeqRow[] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    business_id: string
    name?: string
    customer_ids: string[]
    steps: SequenceStep[]
  }
  const { business_id, name, customer_ids, steps } = body

  if (
    !business_id ||
    !Array.isArray(customer_ids) || !customer_ids.length ||
    !Array.isArray(steps) || !steps.length
  ) {
    return NextResponse.json({ error: 'business_id, customer_ids, and steps required' }, { status: 400 })
  }

  const { data: biz } = await supabase
    .from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sequenceName = name ?? `Winback Sequence — ${new Date().toLocaleDateString('en-AU')}`

  // sequence_steps is a new column not yet in database.types.ts — cast insert payload
  const { data: campaign, error: campErr } = await supabaseAdmin
    .from('campaigns')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      business_id,
      name: sequenceName,
      type: 'winback_sequence',
      channel: 'sms',
      status: 'active',
      recipients_count: customer_ids.length,
      sequence_steps: steps,
      message: steps[0]?.message ?? null,
    } as any)
    .select('id, created_at')
    .single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: 'Campaign creation failed' }, { status: 500 })
  }

  const now = Date.now()
  const sends = customer_ids.flatMap(cid =>
    steps.map((step, i) => ({
      campaign_id: campaign.id,
      customer_id: cid,
      channel: 'sms',
      scheduled_send_at: new Date(now + (step.delay_days ?? 0) * 86_400_000).toISOString(),
      status: 'pending',
      sequence_step: i,
    }))
  )

  // sequence_step is a new column — cast insert payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (sends.length > 0) await supabaseAdmin.from('campaign_sends').insert(sends as any)

  upsertAriaAction({
    business_id,
    category: 'marketing',
    title: `Winback sequence created: ${customer_ids.length} customers, ${steps.length} steps`,
    recommendation: 'Monitor completion rate — customers who return on any earlier step skip remaining sends automatically.',
    reason: `Sequence "${sequenceName}" targets ${customer_ids.length} lapsed customers across ${steps.length} touchpoints.`,
    expected_impact: 'Multi-step sequences recover 12–18% of lapsed customers vs 6–8% for single sends.',
    priority: 'medium',
    status: 'pending',
    source: 'winback_sequence',
    triggered_by: 'winback_sequence',
  }).catch(() => {})

  return NextResponse.json({
    campaign_id: campaign.id,
    sends_scheduled: sends.length,
    steps: steps.length,
    customers: customer_ids.length,
  })
}

export const GET = withErrorCapture('aria/winback-sequence', _GET)
export const POST = withErrorCapture('aria/winback-sequence', _POST)
