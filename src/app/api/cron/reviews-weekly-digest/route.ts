export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ skipped: true, reason: 'RESEND_API_KEY not set' })
  }

  const sb = adminClient()
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const { data: businesses } = await sb
    .from('businesses')
    .select('id, name, user_id, google_place_id, google_average_rating, google_total_reviews')
    .not('google_place_id', 'is', null)
    .eq('is_active', true)

  let sent = 0

  for (const biz of businesses ?? []) {
    try {
      // Get week's review stats
      const { data: weekReviews } = await sb
        .from('google_reviews')
        .select('rating, has_reply, created_at')
        .eq('business_id', biz.id)
        .gte('created_at', weekAgo)

      const { data: allReviews } = await sb
        .from('google_reviews')
        .select('rating, has_reply')
        .eq('business_id', biz.id)

      if (!weekReviews || weekReviews.length === 0) continue

      const newReviews = weekReviews.length
      const weekAvg = weekReviews.reduce((s, r) => s + (r.rating ?? 0), 0) / newReviews
      const unreplied = (allReviews ?? []).filter(r => !r.has_reply).length
      const negatives = weekReviews.filter(r => (r.rating ?? 0) <= 2).length
      const fiveStars = weekReviews.filter(r => r.rating === 5).length

      // Get owner email
      const { data: userData } = await sb.auth.admin.getUserById(biz.user_id)
      const ownerEmail = userData?.user?.email
      if (!ownerEmail) continue

      // Send digest
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Aria <aria@ariaos.site>',
          to: ownerEmail,
          subject: `📊 ${biz.name} weekly review report — ${newReviews} new review${newReviews > 1 ? 's' : ''}`,
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
            <h2 style="margin:0 0 6px">Your reputation this week</h2>
            <p style="color:#888;font-size:13px;margin:0 0 24px">${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>

            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px">
              <div style="background:#f8fafc;padding:14px 16px;border-radius:8px">
                <p style="margin:0;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px">New reviews</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#2D5240">${newReviews}</p>
              </div>
              <div style="background:#f8fafc;padding:14px 16px;border-radius:8px">
                <p style="margin:0;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px">Week average</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#2D5240">⭐ ${weekAvg.toFixed(1)}</p>
              </div>
              <div style="background:#f8fafc;padding:14px 16px;border-radius:8px">
                <p style="margin:0;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px">5-star reviews</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#7FB897">${fiveStars}</p>
              </div>
              <div style="background:${negatives > 0 ? '#fef2f2' : '#f8fafc'};padding:14px 16px;border-radius:8px">
                <p style="margin:0;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px">Negative reviews</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:${negatives > 0 ? '#ef4444' : '#7FB897'}">${negatives}</p>
              </div>
            </div>

            ${unreplied > 0 ? `
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 16px;border-radius:6px;margin-bottom:20px">
                <p style="margin:0;font-weight:600;color:#92400e">${unreplied} review${unreplied > 1 ? 's' : ''} still need a reply</p>
                <p style="margin:4px 0 0;font-size:13px;color:#92400e">Aria has draft replies ready. Just review and publish.</p>
              </div>
            ` : `
              <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:14px 16px;border-radius:6px;margin-bottom:20px">
                <p style="margin:0;font-weight:600;color:#065f46">All caught up</p>
                <p style="margin:4px 0 0;font-size:13px;color:#065f46">Every review has been replied to. Great work.</p>
              </div>
            `}

            <p style="text-align:center;margin:24px 0">
              <a href="https://ariaos.site/dashboard/reviews" style="display:inline-block;padding:12px 24px;background:#2D5240;color:#7FB897;border-radius:8px;text-decoration:none;font-weight:600">
                Open reviews dashboard →
              </a>
            </p>

            <p style="font-size:11px;color:#999;text-align:center;margin-top:32px">
              Sent every Monday by Aria · <a href="https://ariaos.site/dashboard/settings" style="color:#888">manage notifications</a>
            </p>
          </div>`,
        }),
      }).catch(() => {})

      sent++
    } catch { /* continue */ }
  }

  return NextResponse.json({ ok: true, sent })
}
