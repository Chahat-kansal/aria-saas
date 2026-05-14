export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'openid',
  'email',
  'profile',
].join(' ')

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_BUSINESS_CLIENT_ID
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (!clientId) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/social?error=${encodeURIComponent('Google OAuth not configured. Add GOOGLE_CLIENT_ID to Vercel env vars.')}`
    )
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  `${appUrl}/api/social/google/callback`,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state:         business_id,
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
}

export const GET = withErrorCapture('social/google/connect', _GET)