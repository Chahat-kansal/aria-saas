export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { markBriefingStale } from '@/lib/aria/briefing-invalidate'

type Params = { params: { id: string } }

async function _GET(req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: inv } = await supabaseAdmin.from('invoices').select('*').eq('id', params.id).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', inv.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: lines } = await supabaseAdmin
    .from('invoice_line_items').select('*').eq('invoice_id', params.id).order('position')

  return NextResponse.json({ invoice: inv, lines: lines ?? [] })
}

async function _PATCH(req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: inv } = await supabaseAdmin.from('invoices').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', inv.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const allowed = ['status', 'sent_at', 'paid_at', 'send_method', 'pdf_url', 'notes', 'due_date', 'auto_reminders']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in body) update[k] = body[k]

  const { data, error } = await supabaseAdmin.from('invoices').update(update).eq('id', params.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if ('status' in body) {
    markBriefingStale(inv.business_id).catch(() => {})
  }

  return NextResponse.json({ invoice: data })
}

export const GET   = withErrorCapture('invoices/[id]', _GET)
export const PATCH = withErrorCapture('invoices/[id]', _PATCH)
