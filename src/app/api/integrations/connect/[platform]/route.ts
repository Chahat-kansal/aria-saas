export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ platform: string }> }

async function _GET(req: Request, { params }: Params) {
  const { platform }  = await params
  const { searchParams } = new URL(req.url)
  const businessId    = searchParams.get('business_id')
  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (!businessId) {
    return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login`)

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let authUrl: string

  switch (platform) {
    case 'facebook':
    case 'instagram': {
      if (!process.env.META_FBLB_CONFIG_ID) {
        return NextResponse.json({
          error: 'META_FBLB_CONFIG_ID missing — create a Configuration in Meta dashboard'
        }, { status: 500 })
      }

      authUrl = `https://www.facebook.com/v25.0/dialog/oauth?` +
        `client_id=${process.env.META_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(process.env.FACEBOOK_REDIRECT_URI!)}` +
        `&config_id=${process.env.META_FBLB_CONFIG_ID}` +
        `&state=${businessId}` +
        `&response_type=code` +
        `&override_default_response_type=true`
      break
    }

    case 'google_business': {
      const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID
      if (!clientId) {
        return NextResponse.redirect(
          `${appUrl}/dashboard/social?error=GOOGLE_BUSINESS_CLIENT_ID+not+configured`
        )
      }
      const scopes = [
        'https://www.googleapis.com/auth/business.manage',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' ')
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(`${appUrl}/api/integrations/google/callback`)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${businessId}` +
        `&response_type=code` +
        `&access_type=offline` +
        `&prompt=consent`
      break
    }

    default:
      return NextResponse.json({ error: `unknown platform: ${platform}` }, { status: 400 })
  }

  return NextResponse.redirect(authUrl)
}

export const GET = withErrorCapture('integrations/connect', _GET)