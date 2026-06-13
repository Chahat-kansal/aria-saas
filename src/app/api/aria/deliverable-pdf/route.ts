export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { exportDeliverablePdf } from '@/lib/aria/deliverable-pdf'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  const body = await req.json() as { outputId?: string }
  if (!body.outputId) return NextResponse.json({ error: 'outputId required' }, { status: 400 })

  const start = Date.now()
  try {
    const pdfUrl = await exportDeliverablePdf(body.outputId, bid)

    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: bid,
      agent_key: 'deliverable_pdf',
      provider: 'other',
      model_id: 'puppeteer',
      model_provider: 'other',
      role: 'document',
      cost_usd_cents: 0,
      latency_ms: Date.now() - start,
      success: true,
      request_summary: 'export/' + body.outputId,
      response_summary: pdfUrl.slice(0, 200),
    })

    return NextResponse.json({ pdf_url: pdfUrl })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
