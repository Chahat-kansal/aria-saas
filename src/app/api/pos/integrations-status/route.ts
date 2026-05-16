export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

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
  if (!bid) return NextResponse.json({ integrations: [] })

  const { data: socialConns } = await supabase.from('social_connections').select('platform, is_active, platform_account_name').eq('business_id', bid)
  const connMap = Object.fromEntries((socialConns ?? []).map(c => [c.platform, c]))

  const integrations = [
    {
      id: 'stripe',
      name: 'Stripe',
      description: 'Accept card payments online and in-store',
      icon: '💳',
      status: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not_configured',
      setup_url: '/pos/settings/payments',
    },
    {
      id: 'google_business',
      name: 'Google Business Profile',
      description: 'Respond to reviews and post updates',
      icon: '🔍',
      status: connMap['google_business']?.is_active ? 'connected' : 'not_connected',
      account: connMap['google_business']?.platform_account_name ?? null,
      setup_url: '/dashboard/social',
    },
    {
      id: 'facebook',
      name: 'Facebook & Instagram',
      description: 'Schedule and publish social posts',
      icon: '📘',
      status: (connMap['facebook']?.is_active || connMap['instagram']?.is_active) ? 'connected' : 'not_connected',
      account: connMap['facebook']?.platform_account_name ?? null,
      setup_url: '/dashboard/social',
    },
    {
      id: 'square',
      name: 'Square',
      description: 'Sync products and sales from Square POS',
      icon: '⬛',
      status: 'not_configured',
      setup_url: '/pos/setup/migrate/square',
    },
    {
      id: 'xero',
      name: 'Xero',
      description: 'Export sales data to Xero accounting',
      icon: '📊',
      status: 'coming_soon',
      setup_url: null,
    },
  ]

  return NextResponse.json({ integrations })
}

export const GET = withErrorCapture('pos/integrations-status', _GET)