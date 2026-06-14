export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ariaos.site'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    // On Mondays, also send the weekly digest
  const isMonday = new Date().getDay() === 1
  if (isMonday && process.env.RESEND_API_KEY) {
    try {
      await fetch(`${APP_URL}/api/cron/reviews-weekly-digest`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
      })
    } catch (e) { console.error('[non-fatal]', e) }
  }

  return NextResponse.json({ skipped: true, reason: 'GOOGLE_PLACES_API_KEY not set' })
  }

  const sb = adminClient()
  const { data: businesses } = await sb
    .from('businesses')
    .select('id, google_place_id')
    .not('google_place_id', 'is', null)
    .eq('is_active', true)

  let total_synced = 0

  for (const biz of businesses ?? []) {
    try {
      const res = await fetch(`${APP_URL}/api/aria/sync-reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CRON_SECRET}`,
        },
        body: JSON.stringify({ business_id: biz.id, place_id: biz.google_place_id }),
      })
      const data = await res.json() as { reviews_synced?: number }
      total_synced += data.reviews_synced ?? 0
      // Throttle: 1 second between businesses
      await new Promise(r => setTimeout(r, 1000))

      // Check for new negative reviews and alert the owner
      const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
      const { data: newNegatives } = await sb
        .from('google_reviews')
        .select('id, rating, reviewer_name, comment, business_id')
        .eq('business_id', biz.id)
        .lte('rating', 2)
        .eq('has_reply', false)
        .gte('created_at', yesterday)

      if (newNegatives && newNegatives.length > 0) {
        // Get owner email
        const { data: ownerData } = await sb
          .from('businesses')
          .select('user_id, name')
          .eq('id', biz.id)
          .single()

        if (ownerData?.user_id) {
          const { data: userData } = await sb.auth.admin.getUserById(ownerData.user_id)
          const ownerEmail = userData?.user?.email

          if (ownerEmail && process.env.RESEND_API_KEY) {
            // Send urgent email
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'Aria <aria@ariaos.site>',
                to: ownerEmail,
                subject: `⚠️ ${newNegatives.length} new negative review${newNegatives.length > 1 ? 's' : ''} need a reply`,
                html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
                  <h2 style="margin:0 0 16px">Time-sensitive reputation alert</h2>
                  <p>You have ${newNegatives.length} new negative review${newNegatives.length > 1 ? 's' : ''} from the last 24 hours that need a reply.</p>
                  <p><strong>Why this matters:</strong> Customers reading recent reviews are 4x more likely to skip your business if negative reviews go unanswered for 48+ hours.</p>
                  ${newNegatives.slice(0, 3).map(n => `
                    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;margin:12px 0;border-radius:6px">
                      <p style="margin:0 0 4px;font-weight:600">${'⭐'.repeat(n.rating ?? 0)} ${n.reviewer_name ?? 'Anonymous'}</p>
                      <p style="margin:0;font-size:14px;color:#555">"${(n.comment ?? '').slice(0, 200)}${(n.comment?.length ?? 0) > 200 ? '...' : ''}"</p>
                    </div>
                  `).join('')}
                  <p style="margin-top:24px">
                    <a href="https://ariaos.site/dashboard/reviews?filter=negative" style="display:inline-block;padding:10px 20px;background:#2D5240;color:#7FB897;border-radius:8px;text-decoration:none;font-weight:600">
                      Reply now with Aria's AI drafts →
                    </a>
                  </p>
                  <p style="font-size:12px;color:#999;margin-top:24px">Aria has already drafted personalised replies for each. Review and click through to publish.</p>
                </div>`,
              }),
            }).catch(() => {})
          }
        }
      }
    } catch { /* continue */ }
  }

  // On Mondays, also send the weekly digest
  const isMonday = new Date().getDay() === 1
  if (isMonday && process.env.RESEND_API_KEY) {
    try {
      await fetch(`${APP_URL}/api/cron/reviews-weekly-digest`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
      })
    } catch (e) { console.error('[non-fatal]', e) }
  }

  return NextResponse.json({
    ok: true,
    businesses_synced: businesses?.length ?? 0,
    total_synced,
  })
}