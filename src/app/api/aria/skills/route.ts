export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// ── Built-in seed skills — auto-created the first time GET is called per business
const BUILT_IN_SKILLS: Array<{ name: string; icon: string; description: string; system_prompt_addition: string }> = [
  {
    name: 'Accountant',
    icon: '🧮',
    description: 'Cash flow, expenses, GST, profitability.',
    system_prompt_addition: 'Act as the business owner\'s accountant. Focus on cash flow, expenses, GST (10%), BAS lodgement, profitability and margin. Use Australian SMB accounting context. Quote exact dollar figures from the data — never round generously.',
  },
  {
    name: 'Marketing strategist',
    icon: '📣',
    description: 'Customer acquisition, win-back, SEO, campaigns.',
    system_prompt_addition: 'Act as the business\'s marketing strategist. Focus on customer acquisition, win-back of lapsed customers, SEO, social media, and SMS/email campaigns. Suggest specific audiences and message hooks grounded in the business\'s real customer data.',
  },
  {
    name: 'Inventory expert',
    icon: '📦',
    description: 'Stock levels, reorder timing, supplier performance, waste.',
    system_prompt_addition: 'Act as the business\'s inventory expert. Focus on stock levels, reorder timing, supplier performance, slow movers, dead stock and waste reduction. Use real product velocity from sales data, not guesses.',
  },
  {
    name: 'Compliance officer',
    icon: '🛡️',
    description: 'BAS, super, awards, insurance, licences.',
    system_prompt_addition: 'Act as the business\'s compliance officer for Australian SMB rules. Focus on BAS, GST, superannuation, Fair Work awards, insurance, RSA/food safety/liquor licences as applicable. Flag any compliance items approaching their due date.',
  },
  {
    name: 'HR coach',
    icon: '👥',
    description: 'Staff scheduling, rosters, training, retention, awards.',
    system_prompt_addition: 'Act as the business\'s HR coach. Focus on staff scheduling, rostering against demand forecasts, training, retention and Fair Work award compliance. Suggest concrete schedule changes from real labour-ratio data.',
  },
  {
    name: 'Growth advisor',
    icon: '📈',
    description: 'Long-term strategy, expansion, new revenue streams.',
    system_prompt_addition: 'Act as the business\'s growth advisor. Focus on long-term strategy, expansion options, new revenue streams (online, wholesale, second outlet) and industry benchmarking. Use real performance data to size opportunities in A$.',
  },
]

async function ensureBuiltInSeeded(bid: string) {
  const { count } = await supabaseAdmin.from('aria_skills')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', bid).eq('built_in', true)
  if ((count ?? 0) > 0) return
  await supabaseAdmin.from('aria_skills').insert(BUILT_IN_SKILLS.map(s => ({
    business_id: bid,
    name: s.name,
    icon: s.icon,
    description: s.description,
    system_prompt_addition: s.system_prompt_addition,
    built_in: true,
    enabled: false, // start all off — owner opts in
  })))
}

// GET — list this business's skills, seeding built-ins on first visit
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  await ensureBuiltInSeeded(bid)
  const { data } = await supabaseAdmin.from('aria_skills')
    .select('id, name, icon, description, system_prompt_addition, built_in, enabled, created_at')
    .eq('business_id', bid)
    .order('built_in', { ascending: false })
    .order('created_at', { ascending: true })
  return NextResponse.json({ skills: data ?? [] })
}

// POST — create a custom skill
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { name?: string; icon?: string; description?: string; system_prompt_addition?: string }
  const name = (body.name ?? '').trim().slice(0, 80)
  const sysAdd = (body.system_prompt_addition ?? '').trim().slice(0, 1000)
  if (!name || !sysAdd) return NextResponse.json({ error: 'name and system_prompt_addition required' }, { status: 400 })

  // Cap custom skills at 20 per business to prevent runaway
  const { count } = await supabaseAdmin.from('aria_skills')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', bid).eq('built_in', false)
  if ((count ?? 0) >= 20) {
    return NextResponse.json({ error: 'Custom skill limit reached (20). Delete one first.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from('aria_skills').insert({
    business_id: bid,
    name,
    icon: (body.icon ?? '').slice(0, 8) || null,
    description: (body.description ?? '').slice(0, 200) || null,
    system_prompt_addition: sysAdd,
    built_in: false,
    enabled: true,
  }).select('id, name, icon, description, system_prompt_addition, built_in, enabled, created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ skill: data })
}

// PUT — toggle enabled or edit a custom skill
async function _PUT(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    id?: string
    enabled?: boolean
    name?: string
    icon?: string
    description?: string
    system_prompt_addition?: string
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Only the enabled flag is editable on built-ins; everything else only on custom skills
  const { data: existing } = await supabaseAdmin.from('aria_skills')
    .select('id, built_in').eq('id', body.id).eq('business_id', bid).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (body.enabled !== undefined) patch.enabled = !!body.enabled
  if (!existing.built_in) {
    if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 80)
    if (body.icon !== undefined) patch.icon = String(body.icon).slice(0, 8) || null
    if (body.description !== undefined) patch.description = String(body.description).slice(0, 200) || null
    if (body.system_prompt_addition !== undefined) {
      const v = String(body.system_prompt_addition).trim().slice(0, 1000)
      if (!v) return NextResponse.json({ error: 'system_prompt_addition cannot be empty' }, { status: 400 })
      patch.system_prompt_addition = v
    }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 })

  await supabaseAdmin.from('aria_skills').update(patch).eq('id', body.id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

// DELETE — only custom skills (built-ins are protected)
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('aria_skills')
    .select('id, built_in').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.built_in) return NextResponse.json({ error: 'Built-in skills cannot be deleted — toggle off instead' }, { status: 400 })

  await supabaseAdmin.from('aria_skills').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('aria/skills', _GET)
export const POST   = withErrorCapture('aria/skills', _POST)
export const PUT    = withErrorCapture('aria/skills', _PUT)
export const DELETE = withErrorCapture('aria/skills', _DELETE)
