export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ skills: [], areas: [] })

  const [skillsQ, areasQ] = await Promise.all([
    supabase.from('staff_skills').select('*').eq('business_id', bid).order('sort_order'),
    supabase.from('staff_areas').select('*').eq('business_id', bid).eq('is_active', true).order('sort_order'),
  ])
  return NextResponse.json({ skills: skillsQ.data ?? [], areas: areasQ.data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const kind = String(body.kind ?? 'skill')
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  if (kind === 'area') {
    const { data, error } = await supabase.from('staff_areas').insert({
      business_id: bid, outlet_id: body.outlet_id ?? null,
      name, description: body.description ?? null, color: body.color ?? '#6366f1',
    }).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: (error as { code?: string }).code === '23505' ? 409 : 500 })
    return NextResponse.json({ area: data }, { status: 201 })
  }

  const { data, error } = await supabase.from('staff_skills').insert({
    business_id: bid, name, description: body.description ?? null, color: body.color ?? '#6366f1',
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: (error as { code?: string }).code === '23505' ? 409 : 500 })
  return NextResponse.json({ skill: data }, { status: 201 })
}

export const GET = withErrorCapture('staff/skills', _GET)
export const POST = withErrorCapture('staff/skills', _POST)
