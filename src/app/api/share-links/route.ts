export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { randomBytes } from 'crypto'

const SHAREABLE_PAGES = [
  { key: 'Overview', label: 'Overview / Dashboard' },
  { key: 'Cash Flow', label: 'Cash Flow' },
  { key: 'Invoices', label: 'Invoices' },
  { key: 'Sales & Revenue', label: 'Sales & Revenue' },
  { key: 'Staff & Labour', label: 'Staff & Labour' },
  { key: 'Weekly Reports', label: 'Weekly Reports' },
  { key: 'Profit Leaks', label: 'Profit Leaks' },
  { key: 'Competitor Intelligence', label: 'Competitor Intelligence' },
]

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    business_id?: string
    label?: string
    recipient_name?: string
    recipient_email?: string
    pages_allowed?: string[]
    expires_in_days?: number | null
  }
  const { business_id, label, recipient_name, recipient_email, pages_allowed, expires_in_days } = body

  if (!business_id || !label || !pages_allowed?.length) {
    return NextResponse.json({ error: 'business_id, label, and pages_allowed required' }, { status: 400 })
  }

  const { data: biz } = await supabase
    .from('businesses').select('id, name, trading_name')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const token = randomBytes(20).toString('hex')
  const expires_at = expires_in_days
    ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { data: link, error: insertErr } = await supabaseAdmin
    .from('dashboard_share_links')
    .insert({
      business_id, token, label,
      recipient_name: recipient_name ?? null,
      recipient_email: recipient_email ?? null,
      pages_allowed, expires_at, is_active: true, access_count: 0,
    })
    .select('id, token').single()

  if (insertErr || !link) {
    return NextResponse.json({ error: insertErr?.message ?? 'Failed to create link' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ariaos.site'
  return NextResponse.json({ ok: true, token, url: `${appUrl}/shared/${token}`, id: link.id })
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const business_id = url.searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: links } = await supabaseAdmin
    .from('dashboard_share_links')
    .select('id, token, label, recipient_name, recipient_email, pages_allowed, expires_at, is_active, access_count, last_accessed_at, created_at')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ariaos.site'
  return NextResponse.json({
    links: (links ?? []).map(l => ({ ...l, url: `${appUrl}/shared/${l.token}` })),
    shareable_pages: SHAREABLE_PAGES,
  })
}

export const POST = withErrorCapture('share-links', _POST)
export const GET = withErrorCapture('share-links', _GET)
