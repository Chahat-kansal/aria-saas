export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// TICKETS-REBUILD+BATCH-1 — list the scan-to-print batches for the owner's price-tickets feature.

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ batches: [] })

  const { data: batches } = await supabaseAdmin.from('ticket_print_batches')
    .select('id, name, status, item_count, created_by_staff_id, created_at, printed_at, template_id')
    .eq('business_id', bid).order('created_at', { ascending: false }).limit(50)
  const staffIds = Array.from(new Set((batches ?? []).map(b => b.created_by_staff_id as string).filter(Boolean)))
  const { data: staff } = staffIds.length
    ? await supabaseAdmin.from('pos_staff').select('id, name').in('id', staffIds)
    : { data: [] }
  const nameMap = new Map((staff ?? []).map((s: { id: string; name: string }) => [s.id, s.name]))

  return NextResponse.json({
    batches: (batches ?? []).map(b => ({
      id: b.id, name: b.name, status: b.status, item_count: b.item_count,
      created_by: (b.created_by_staff_id && nameMap.get(b.created_by_staff_id as string)) ?? 'Staff',
      created_at: b.created_at, printed_at: b.printed_at, template_id: b.template_id,
    })),
  })
}

export const GET = withErrorCapture('tickets/batches', _GET)
