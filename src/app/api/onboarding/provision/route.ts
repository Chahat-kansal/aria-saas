export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ProvStep = { step: string; label: string; status: 'pending' | 'running' | 'done' | 'failed' }

const STEP_DEFS: ProvStep[] = [
  { step: 'categories', label: 'Setting up your menu & categories', status: 'pending' },
  { step: 'hours',      label: 'Configuring your trading hours',    status: 'pending' },
  { step: 'compliance', label: 'Preparing compliance tracking',     status: 'pending' },
  { step: 'briefing',   label: 'Briefing Aria on your business',    status: 'pending' },
  { step: 'finalize',   label: 'Finalising',                        status: 'pending' },
]

const INDUSTRY_CATEGORIES: Record<string, Array<{ name: string; color: string }>> = {
  cafe:       [{ name: 'Coffee', color: '#6F4E37' }, { name: 'Food', color: '#F59E0B' }, { name: 'Drinks', color: '#4A9EBA' }, { name: 'Extras', color: '#8B5CF6' }],
  retail:     [{ name: 'Spirits', color: '#B8854A' }, { name: 'Beer', color: '#D4956A' }, { name: 'Wine', color: '#7B4754' }, { name: 'Snacks', color: '#F59E0B' }],
  restaurant: [{ name: 'Mains', color: '#10B981' }, { name: 'Starters', color: '#F59E0B' }, { name: 'Drinks', color: '#4A9EBA' }, { name: 'Desserts', color: '#EC4899' }],
  salon:      [{ name: 'Hair', color: '#8B5CF6' }, { name: 'Nails', color: '#EC4899' }, { name: 'Treatments', color: '#7FB897' }],
  gym:        [{ name: 'Memberships', color: '#7FB897' }, { name: 'Classes', color: '#4A9EBA' }, { name: 'Products', color: '#F59E0B' }],
  tradie:     [{ name: 'Labour', color: '#7FB897' }, { name: 'Materials', color: '#4A9EBA' }, { name: 'Callouts', color: '#F59E0B' }],
}
const DEFAULT_CATEGORIES = [{ name: 'Products', color: '#7FB897' }, { name: 'Services', color: '#4A9EBA' }]

const COMPLIANCE_KEYS: Record<string, string[]> = {
  cafe:       ['food_safety_cert', 'food_safety_plan', 'rsa_training', 'allergen_labelling'],
  retail:     ['rsa_training', 'fire_safety', 'public_liability', 'hazmat_compliance'],
  restaurant: ['food_safety_cert', 'food_safety_plan', 'rsa_training', 'fire_safety'],
  salon:      ['public_liability', 'product_safety', 'fire_safety'],
  gym:        ['public_liability', 'first_aid_cert', 'equipment_checks'],
  tradie:     ['public_liability', 'whs_policy', 'contractor_insurance'],
}
const DEFAULT_COMPLIANCE = ['public_liability', 'fire_safety']

async function writeSteps(bizId: string, steps: ProvStep[]) {
  await supabaseAdmin
    .from('business_onboarding')
    .update({ provisioning_steps: steps })
    .eq('business_id', bizId)
}

async function runProvision(
  bizId: string,
  industry: string | null,
  businessModel: string | null,
  stepData: Record<string, unknown>,
  bizName: string,
) {
  const steps: ProvStep[] = STEP_DEFS.map(s => ({ ...s }))

  // Step 1: categories
  steps[0].status = 'running'
  await writeSteps(bizId, steps)
  try {
    if (businessModel !== 'service') {
      if (industry === 'cafe') {
        // Run the same upsert logic as the cafe seed route (categories only — products seeded separately)
        const cafeCats = INDUSTRY_CATEGORIES.cafe
        for (const cat of cafeCats) {
          await supabaseAdmin.from('pos_categories').upsert(
            { business_id: bizId, name: cat.name, color: cat.color },
            { onConflict: 'business_id,name' }
          )
        }
      } else {
        const cats = INDUSTRY_CATEGORIES[industry ?? ''] ?? DEFAULT_CATEGORIES
        for (const cat of cats) {
          await supabaseAdmin.from('pos_categories').upsert(
            { business_id: bizId, name: cat.name, color: cat.color },
            { onConflict: 'business_id,name' }
          )
        }
      }
    }
    steps[0].status = 'done'
  } catch {
    steps[0].status = 'done' // non-fatal — categories can be added manually
  }
  await writeSteps(bizId, steps)

  // Step 2: trading hours
  steps[1].status = 'running'
  await writeSteps(bizId, steps)
  try {
    const { count } = await supabaseAdmin
      .from('business_hours')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', bizId)
    if (!count || count === 0) {
      // 0=Sun,1=Mon,...,6=Sat — seed Mon–Sat 9am–6pm, Sun 10am–5pm
      const hourRows = [
        { day_of_week: 1, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 2, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 3, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 4, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 5, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 6, open_time: '09:00', close_time: '17:00', is_closed: false },
        { day_of_week: 0, open_time: '10:00', close_time: '17:00', is_closed: false },
      ]
      await supabaseAdmin.from('business_hours').insert(
        hourRows.map(r => ({ ...r, business_id: bizId }))
      )
    }
    steps[1].status = 'done'
  } catch {
    steps[1].status = 'done' // non-fatal
  }
  await writeSteps(bizId, steps)

  // Step 3: compliance items
  steps[2].status = 'running'
  await writeSteps(bizId, steps)
  try {
    const keys = COMPLIANCE_KEYS[industry ?? ''] ?? DEFAULT_COMPLIANCE
    for (const key of keys) {
      await supabaseAdmin.from('compliance_items').upsert(
        { business_id: bizId, key, checked: false },
        { onConflict: 'business_id,key' }
      )
    }
    steps[2].status = 'done'
  } catch {
    steps[2].status = 'done' // non-fatal
  }
  await writeSteps(bizId, steps)

  // Step 4: first aria_daily_briefing
  steps[3].status = 'running'
  await writeSteps(bizId, steps)
  try {
    const today = new Date().toISOString().split('T')[0]
    const { count: existing } = await supabaseAdmin
      .from('aria_daily_briefings')
      .select('business_id', { count: 'exact', head: true })
      .eq('business_id', bizId)
      .eq('briefing_date', today)
    if (!existing || existing === 0) {
      const ownerName = (stepData.owner_name as string) || 'there'
      const challenge = (stepData.biggest_challenge as string) || ''
      const promptCtx = `Business: ${bizName}, industry: ${industry ?? 'retail'}, owner: ${ownerName}${challenge ? ', biggest challenge: ' + challenge : ''}. Today is their first day with Aria OS.`
      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Write a 2-sentence welcoming daily briefing from Aria (AI business co-owner) to the business owner. Warm, Australian, practical — no corporate speak. ${promptCtx}`,
        }],
      })
      const text = resp.content[0].type === 'text'
        ? resp.content[0].text.trim()
        : `Welcome aboard, ${ownerName} — Aria is now live for ${bizName}. Check your dashboard for today's insights and let's get started.`
      await supabaseAdmin.from('aria_daily_briefings').upsert(
        { business_id: bizId, briefing_date: today, content: text, generated_at: new Date().toISOString(), source: 'onboarding' },
        { onConflict: 'business_id,briefing_date' }
      )
    }
    steps[3].status = 'done'
  } catch {
    steps[3].status = 'done' // non-fatal — briefing regenerates on next cron
  }
  await writeSteps(bizId, steps)

  // Step 5: finalize
  steps[4].status = 'running'
  await writeSteps(bizId, steps)
  await supabaseAdmin.from('businesses').update({ onboarding_complete: true }).eq('id', bizId)
  await supabaseAdmin.from('business_onboarding').update({
    current_step: 'complete',
    provisioning_status: 'complete',
    provisioning_steps: steps.map(s => ({ ...s, status: s.status === 'running' ? 'done' : s.status })),
  }).eq('business_id', bizId)
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: onb } = await supabaseAdmin
    .from('business_onboarding')
    .select('provisioning_status, provisioning_steps, provisioning_error')
    .eq('business_id', biz.id)
    .maybeSingle()

  return NextResponse.json({
    provisioning_status: onb?.provisioning_status ?? 'pending',
    provisioning_steps:  onb?.provisioning_steps  ?? [],
    provisioning_error:  onb?.provisioning_error  ?? null,
    business_name:       biz.name,
  })
}

async function _POST(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, industry, business_model')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: onb } = await supabaseAdmin
    .from('business_onboarding')
    .select('provisioning_status, step_data')
    .eq('business_id', biz.id)
    .maybeSingle()

  // Idempotent: already complete
  if (onb?.provisioning_status === 'complete') {
    return NextResponse.json({ provisioning_status: 'complete' })
  }

  await supabaseAdmin
    .from('business_onboarding')
    .update({ provisioning_status: 'running', provisioning_error: null })
    .eq('business_id', biz.id)

  try {
    await runProvision(
      biz.id,
      (biz as Record<string, unknown>).industry as string | null,
      (biz as Record<string, unknown>).business_model as string | null,
      (onb?.step_data as Record<string, unknown>) ?? {},
      biz.name ?? 'your business',
    )
    return NextResponse.json({ provisioning_status: 'complete' })
  } catch (e) {
    const msg = (e as Error).message ?? 'Provisioning failed'
    await supabaseAdmin
      .from('business_onboarding')
      .update({ provisioning_status: 'failed', provisioning_error: msg })
      .eq('business_id', biz.id)
    return NextResponse.json({ provisioning_status: 'failed', error: msg }, { status: 500 })
  }
}

export const GET  = withErrorCapture('onboarding/provision', _GET)
export const POST = withErrorCapture('onboarding/provision', _POST)
