export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const { token } = params

  const { data: link } = await supabaseAdmin
    .from('dashboard_share_links')
    .select('id, business_id, label, pages_allowed, expires_at, is_active, access_count')
    .eq('token', token)
    .maybeSingle()

  if (!link || !link.is_active) {
    return NextResponse.json({ error: 'invalid_token', message: 'This link has expired or is invalid.' }, { status: 404 })
  }

  if (link.expires_at && new Date(link.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'expired', message: 'This link has expired. Ask the business owner for a new link.' }, { status: 410 })
  }

  await supabaseAdmin.from('dashboard_share_links').update({
    access_count: ((link.access_count as number) ?? 0) + 1,
    last_accessed_at: new Date().toISOString(),
  }).eq('id', link.id)

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id, name, trading_name, city, industry')
    .eq('id', link.business_id as string).maybeSingle()

  return NextResponse.json({
    ok: true,
    business_id: link.business_id,
    business_name: (biz?.trading_name ?? biz?.name) as string | null,
    city: biz?.city as string | null,
    label: link.label,
    pages_allowed: link.pages_allowed,
  })
}
