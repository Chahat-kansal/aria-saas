export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { checkRateLimit } from '@/lib/rate-limit'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit('messaging', user.id)
  if (!rl.ok) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const body = await req.json() as { customer_ids: string[]; message_override?: string }
  const { customer_ids, message_override } = body

  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    return NextResponse.json({ error: 'customer_ids array required' }, { status: 400 })
  }
  if (customer_ids.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 customers per bulk send' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  let sent = 0
  let failed = 0
  const errors: Array<{ id: string; error: string }> = []

  for (let i = 0; i < customer_ids.length; i++) {
    const id = customer_ids[i]
    try {
      const bodyPayload: Record<string, string> = {}
      if (message_override) bodyPayload.message_override = message_override

      const res = await fetch(appUrl + '/api/customers/' + id + '/winback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
        body: JSON.stringify(bodyPayload),
      })
      if (res.ok) {
        sent++
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        failed++
        errors.push({ id, error: d.error ?? 'Failed' })
      }
    } catch (e) {
      failed++
      errors.push({ id, error: String(e) })
    }

    // Stagger: 1 per second to avoid Twilio rate limits (skip last item)
    if (i < customer_ids.length - 1) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  return NextResponse.json({ sent, failed, errors })
}

export const POST = withErrorCapture('customers/bulk-winback', _POST)
