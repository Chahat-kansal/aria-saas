export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { validateBody } from '@/lib/api/validate'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const RecurringSchema = z.object({
  invoiceId: z.string().uuid(),
  frequency: z.enum(['weekly', 'monthly', 'quarterly']),
})

function nextDueDate(frequency: string): string {
  const d = new Date()
  if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1)
  else d.setMonth(d.getMonth() + 3)
  return d.toISOString().slice(0, 10)
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await validateBody(req, RecurringSchema)
  if ('error' in parsed) return parsed.error
  const { invoiceId, frequency } = parsed.data

  const { data: inv } = await supabaseAdmin.from('invoices').select('id, business_id').eq('id', invoiceId).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', inv.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin.from('recurring_invoices').insert({
    business_id: inv.business_id,
    base_invoice_id: invoiceId,
    frequency,
    next_due_date: nextDueDate(frequency),
    is_active: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recurring: data })
}

export const POST = withErrorCapture('invoices/recurring', _POST)
