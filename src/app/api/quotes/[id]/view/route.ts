export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? null
  const ua = req.headers.get('user-agent') ?? null

  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .select('id,status,view_count')
    .eq('id', id)
    .maybeSingle()
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const newCount = ((quote.view_count as number | null) ?? 0) + 1
  const newStatus = (quote.status === 'sent') ? 'viewed' : quote.status

  await Promise.all([
    supabaseAdmin.from('quote_views').insert({
      quote_id: id, ip_address: ip, user_agent: ua,
    }),
    supabaseAdmin.from('quotes').update({
      view_count: newCount,
      last_viewed_at: new Date().toISOString(),
      status: newStatus,
    }).eq('id', id),
  ])

  return NextResponse.json({ ok: true, view_count: newCount })
}
