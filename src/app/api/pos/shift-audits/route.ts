export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ audits: [], templates: [] })
  const { searchParams } = new URL(req.url)

  if (searchParams.get('type') === 'templates') {
    const { data: biz } = await supabase.from('businesses').select('industry').eq('id', bid).maybeSingle()
    const industry = String(biz?.industry ?? 'retail').toLowerCase()
    const { data: templates } = await supabaseAdmin.from('pos_audit_templates')
      .select('*')
      .or(`business_id.eq.${bid},and(business_id.is.null,industry.in.(${industry},all))`)
      .eq('is_active', true).order('sort_order')
    return NextResponse.json({ templates: templates ?? [] })
  }

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30'), 100)
  const { data } = await supabase.from('pos_shift_audits').select('*').eq('business_id', bid).order('shift_date', { ascending: false }).limit(limit)
  return NextResponse.json({ audits: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { session_id?: string; shift_report_id?: string; cashier_name?: string; completed_by?: string; results: Array<{ template_id: string; name: string; category: string; required: boolean; passed: boolean; value?: string | number; note?: string }> }
  if (!body.results?.length) return NextResponse.json({ error: 'results required' }, { status: 400 })

  const total = body.results.length
  const passed = body.results.filter(r => r.passed).length
  const failed = body.results.filter(r => !r.passed)
  const flaggedItems = failed.filter(r => r.required).map(r => ({ name: r.name, category: r.category, note: r.note ?? 'Not completed' }))

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let ariaAssessment = ''
  if (flaggedItems.length > 0) {
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 150,
        system: 'You are Aria. Write a 1-2 sentence alert for a business owner about failed audit checks. Be direct. Under 40 words.',
        messages: [{ role: 'user', content: `Failed: ${flaggedItems.map((f: any) => f.name).join(', ')}. ${passed}/${total} passed.` }],
      })
      ariaAssessment = msg.content[0].type === 'text' ? msg.content[0].text : ''
    } catch { ariaAssessment = `${flaggedItems.length} required check${flaggedItems.length > 1 ? 's' : ''} not completed.` }
  } else {
    ariaAssessment = `All ${total} audit checks passed.`
  }

  const { data: audit, error } = await supabaseAdmin.from('pos_shift_audits').insert({
    business_id: bid, session_id: body.session_id ?? null, shift_report_id: body.shift_report_id ?? null,
    cashier_name: body.cashier_name ?? null, completed_by: body.completed_by ?? null,
    shift_date: new Date().toISOString().slice(0, 10),
    results: body.results, total_checks: total, passed_checks: passed,
    failed_checks: total - passed, flagged_items: flaggedItems, aria_assessment: ariaAssessment,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (flaggedItems.length > 0) {
    supabaseAdmin.from('aria_autopilot_actions').insert({
      business_id: bid, category: 'compliance', priority: 'urgent',
      title: `Shift audit: ${flaggedItems.length} failed check${flaggedItems.length > 1 ? 's' : ''}`,
      description: ariaAssessment,
      action_data: { flagged_items: flaggedItems, audit_id: audit.id, session_id: body.session_id },
      estimated_impact: 'Compliance risk', status: 'pending',
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ audit, ok: true }, { status: 201 })
}

export const GET = withErrorCapture('pos/shift-audits', _GET)
export const POST = withErrorCapture('pos/shift-audits', _POST)
