export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ policies: {} })
  const { data } = await supabase.from('businesses').select('enterprise_policies').eq('id', bid).maybeSingle()
  return NextResponse.json({ policies: data?.enterprise_policies ?? {} })
}

async function _PATCH(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const policies = await req.json()
  await supabase.from('businesses').update({ enterprise_policies: policies }).eq('id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/enterprise-policies', _GET)
export const PATCH = withBusinessContext('pos/enterprise-policies', _PATCH)
