export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { issueOAuthState } from '@/lib/integrations/oauth-state'
import { SLACK_KEY } from '@/lib/integrations/slack'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('business_id')
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // CONNECTOR-VAULT-1a — this previously trusted business_id from the query string with no
  // ownership check at all before embedding it in the (also unsigned) OAuth state.
  const denied = await verifyBusinessAccess(user.id, businessId)
  if (denied) return denied

  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'Slack not configured' }, { status: 503 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const redirectUri = appUrl + '/api/integrations/slack/callback'

  // CONNECTOR-VAULT-1a — signed, server-issued, single-use, expiring state (was unsigned base64url
  // JSON, decoded and trusted blindly on the way back).
  const state = await issueOAuthState(businessId, SLACK_KEY)

  const url = 'https://slack.com/oauth/v2/authorize' +
    '?client_id=' + encodeURIComponent(clientId) +
    '&scope=' + encodeURIComponent('chat:write,channels:read,groups:read') +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&state=' + encodeURIComponent(state)

  return NextResponse.redirect(url)
}

export const GET = withErrorCapture('integrations/slack/connect', _GET)
