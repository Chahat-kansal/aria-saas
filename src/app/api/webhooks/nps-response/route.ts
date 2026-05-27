export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  const twiml = (msg: string) => new Response(
    `<?xml version="1.0"?><Response><Message>${msg}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )

  let body = '', from = ''
  try {
    const fd = await req.formData()
    body = (fd.get('Body') as string ?? '').trim()
    from = (fd.get('From') as string ?? '').replace(/\s/g, '')
  } catch { return twiml('Thanks for your response!') }

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
