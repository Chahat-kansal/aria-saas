export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Runs daily — finds businesses with 3 days left in trial and sends warning email
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const in3DaysEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000)

  // Find trials ending in exactly 3 days (within 1 hour window)
  const { data: subs, error } = await supabaseAdmin
    .from('business_subscriptions')
    .select('business_id, trial_ends_at')
    .eq('status', 'trialing')
    .gte('trial_ends_at', in3Days.toISOString())
    .lt('trial_ends_at', in3DaysEnd.toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const sub of subs) {
    try {
      // Get business + owner email
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('name, user_id')
        .eq('id', sub.business_id)
        .maybeSingle()

      if (!biz) continue

      const { data: profile } = await supabaseAdmin.auth.admin.getUserById(biz.user_id)
      const email = profile.user?.email
      if (!email) continue

      const trialEnd = new Date(sub.trial_ends_at)
      const formatted = trialEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

      // Send via SendGrid
      const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
      if (SENDGRID_API_KEY) {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: 'hello@ariaos.site', name: 'Aria OS' },
            subject: `⏱ Your Aria trial ends in 3 days — ${biz.name}`,
            content: [{
              type: 'text/html',
              value: `
                <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0E1411;color:#e8ede9;border-radius:16px">
                  <div style="font-size:28px;margin-bottom:24px">⏱</div>
                  <h2 style="margin:0 0 8px;font-size:18px;color:#fff">Your Aria trial ends in 3 days</h2>
                  <p style="margin:0 0 16px;color:rgba(255,255,255,0.6);font-size:14px;line-height:1.6">
                    Hey! Just a heads up — your free trial for <strong style="color:#fff">${biz.name}</strong> ends on
                    <strong style="color:#fff">${formatted}</strong>.
                  </p>
                  <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px;line-height:1.6">
                    After that, AI features will pause and POS transactions will be disabled — but your data stays safe.
                    Upgrade now to keep everything running without interruption.
                  </p>
                  <a href="https://ariaos.site/billing" style="display:inline-block;background:#7FB897;color:#0E1411;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
                    Choose a plan →
                  </a>
                  <p style="margin:24px 0 0;color:rgba(255,255,255,0.3);font-size:12px">
                    Questions? Reply to this email or contact support@ariaos.site
                  </p>
                </div>
              `,
            }],
          }),
        })
      }

      // Also write a notification to the dashboard
      await supabaseAdmin.from('aria_notifications').upsert({
        business_id: sub.business_id,
        type: 'trial_warning',
        title: 'Trial ending in 3 days',
        message: `Your free trial ends on ${formatted}. Upgrade now to avoid interruption.`,
        action_url: '/billing',
        action_label: 'View plans',
        read: false,
        created_at: new Date().toISOString(),
      }, { onConflict: 'business_id,type', ignoreDuplicates: false }).select()

      sent++
    } catch (err) {
      console.error('trial-warning send error', sub.business_id, err)
    }
  }

  return NextResponse.json({ sent, total: subs.length })
}
