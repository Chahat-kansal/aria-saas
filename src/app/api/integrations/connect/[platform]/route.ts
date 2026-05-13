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
      const appId = process.env.META_APP_ID ?? process.env.FACEBOOK_APP_ID
      if (!appId) {
        return NextResponse.redirect(
          `${appUrl}/dashboard/social?error=META_APP_ID+not+configured`
        )
      }
      const scopes = [
        'pages_show_list',
        'pages_manage_posts',
        'pages_read_engagement',
        'instagram_basic',
        'instagram_content_publish',
        'business_management',
      ].join(',')
      authUrl = `https://www.facebook.com/v25.0/dialog/oauth?` +
        `client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(`${appUrl}/api/integrations/facebook/callback`)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${businessId}` +
        `&response_type=code`
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