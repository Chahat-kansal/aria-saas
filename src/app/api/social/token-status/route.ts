export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connections: [] })
  const business_id = req.nextUrl.searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ connections: [] })

  const { data: conns } = await supabase.from('social_connections')
    .select('platform, token_expires_at, is_active, platform_account_name')
    .eq('business_id', business_id).eq('is_active', true)

  const now = new Date()
  const warnings = (conns ?? []).map((c: any) => {
    if (!c.token_expires_at) return { ...c, expires_in_days: null, warning: false, expired: false }
    const exp = new Date(c.token_expires_at)
    const daysLeft = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return {
      ...c,
      expires_in_days: daysLeft,
      warning: daysLeft < 7,
      expired: daysLeft < 0,
    }
  })

  return NextResponse.json({ connections: warnings })
}

export const GET = withErrorCapture('social/token-status', _GET)
