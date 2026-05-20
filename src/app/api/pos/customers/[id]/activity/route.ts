export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
type Params = { params: Promise<{ id: string }> | { id: string } }

async function _GET(_req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabaseAdmin.from('customer_activity').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(50)
  return NextResponse.json({ activity: data ?? [] })
}

async function _POST(req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { business_id, type, content, amount_cents } = body
  const { data, error } = await supabaseAdmin.from('customer_activity').insert({
    business_id, customer_id: id, type, content: content ?? null,
    amount_cents: amount_cents ?? null, created_by: user.email ?? 'owner',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data })
}

export const GET = withErrorCapture('pos/customers/[id]/activity', _GET)
export const POST = withErrorCapture('pos/customers/[id]/activity', _POST)
