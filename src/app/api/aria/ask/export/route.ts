export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { generateExport } from '@/lib/aria/ask/files'
import type { ExportFormat, ExportSubject } from '@/lib/aria/ask/files'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  const body = await req.json() as { subject?: string; format?: string; period?: string }
  const subject = (body.subject ?? 'sales') as ExportSubject
  const format = (body.format ?? 'csv') as ExportFormat
  const period = body.period ?? 'month'

  const result = await generateExport(bid, subject, format, period)
  return NextResponse.json(result)
}

export const POST = withErrorCapture('aria/ask/export', _POST)
