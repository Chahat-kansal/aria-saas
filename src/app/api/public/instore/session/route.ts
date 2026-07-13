export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { validateToken, SESSION_MAX_AGE, TABLET_MAX_AGE } from '@/lib/kiosk/tokens'
import { signKioskValue } from '@/lib/kiosk/cookie'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// Redeems a kiosk token (?t=, customer phone, 7-min) or tablet key (?key=, 30-day),
// sets the session cookie and redirects to the clean kiosk URL. Path=/ so the chat
// API under /api/public/instore can read it (a /in-store path cookie would not reach it).
async function _GET(req: Request) {
  const url = new URL(req.url)
  const biz = url.searchParams.get('biz') ?? ''
  const t = url.searchParams.get('t')
  const key = url.searchParams.get('key')
  const next = url.searchParams.get('next')
  if (!biz) return NextResponse.redirect(new URL('/', req.url))

  // Only allow known sub-pages as a post-redeem destination.
  const suffix = next === 'welcome' || next === 'cart' ? `/${next}` : ''
  const dest = new URL(`/in-store/${biz}${suffix}`, req.url)
  let maxAge = 0
  if (t && await validateToken(supabaseAdmin, biz, t)) {
    maxAge = SESSION_MAX_AGE
  } else if (key) {
    const { data } = await supabaseAdmin.from('instore_kiosk_configs').select('id').eq('business_id', biz).eq('tablet_api_key', key).maybeSingle()
    if (data) maxAge = TABLET_MAX_AGE
  }

  const res = NextResponse.redirect(dest)
  if (maxAge > 0) {
    res.cookies.set(`ariakiosk_${biz}`, signKioskValue(biz, maxAge), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge,
    })
  }
  return res
}

export const GET = withErrorCapture('public/instore/session', _GET)
