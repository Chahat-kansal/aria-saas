export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { limit } from '@/lib/rate-limit'

// H-12 — this webhook reads Body/From in Twilio's inbound-SMS format but had zero signature
// verification: anyone who knows/guesses a customer's phone number could POST a fake NPS score
// attributed to them. No `twilio` package dependency and no TWILIO_AUTH_TOKEN env var exist
// anywhere in this codebase (confirmed via grep) — so despite the Twilio-shaped payload, this may
// actually be provisioned through a different SMS vendor. Real signature validation
// (twilio.validateRequest with TWILIO_AUTH_TOKEN) should replace this shared-secret gate once the
// actual inbound SMS provider is confirmed. Pattern follows CLICKSEND_INBOUND_SECRET in
// src/app/api/webhooks/clicksend-inbound/route.ts.
function authorised(req: Request, url: URL): boolean {
  const secret = process.env.NPS_WEBHOOK_SECRET
  if (!secret) return false // fail closed
  const provided = url.searchParams.get('secret') ?? req.headers.get('x-nps-secret') ?? ''
  const expected = Buffer.from(secret)
  const actual = Buffer.from(provided)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function POST(req: Request) {
  const twiml = (msg: string) => new Response(
    `<?xml version="1.0"?><Response><Message>${msg}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )

  const url = new URL(req.url)
  if (!authorised(req, url)) return new Response('Forbidden', { status: 403 })

  let body = '', from = ''
  try {
    const fd = await req.formData()
    body = (fd.get('Body') as string ?? '').trim()
    from = (fd.get('From') as string ?? '').replace(/\s/g, '')
  } catch { return twiml('Thanks for your response!') }

  if (!from) return twiml('Thanks for your response!')

  const rl = await limit(`nps-response:${from}`, { requests: 5, window: '1 h' })
  if (!rl.ok) return new Response('Too Many Requests', { status: 429 })

  const score = parseInt(body)
  if (isNaN(score) || score < 0 || score > 10) {
    return twiml('Please reply with a number between 0 and 10.')
  }

  const normalised = from.replace(/^\+61/, '0')
  const { data: customers } = await supabaseAdmin.from('pos_customers')
    .select('id, business_id')
    .or(`phone.eq.${from},phone.eq.${normalised}`)
    .limit(1)

  const customer = customers?.[0]
  if (!customer) return twiml('Thanks for your feedback!')

  const { data: recentSale } = await supabaseAdmin.from('pos_sales')
    .select('id').eq('customer_id', customer.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  await supabaseAdmin.from('nps_responses').insert({
    business_id: customer.business_id,
    customer_id: customer.id,
    sale_id: recentSale?.id ?? null,
    score,
    responded_at: new Date().toISOString(),
  })

  const label = score >= 9 ? 'Thank you! We love having you as a customer 🙏'
    : score >= 7 ? 'Thanks for the feedback — we appreciate it!'
    : "Thanks for your honesty. We'll work hard to do better."

  return twiml(label)
}
