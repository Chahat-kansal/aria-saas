export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { WHOLESALE_POST_PRIVACY_RULES } from '@/lib/aria-system-prompt'
import Anthropic from '@anthropic-ai/sdk'

function containsPII(text: string, customers: Array<{ name?: string | null; business_name?: string | null; email?: string | null; abn?: string | null }>): boolean {
  const lower = text.toLowerCase()
  for (const c of customers) {
    if (c.business_name && lower.includes(c.business_name.toLowerCase())) return true
    if (c.name && lower.includes(c.name.toLowerCase())) return true
    if (c.email && lower.includes(c.email.toLowerCase())) return true
    if (c.abn && lower.includes(c.abn.toLowerCase())) return true
  }
  return false
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, name, industry').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch last 30 wholesale orders
  const { data: orders } = await supabaseAdmin
    .from('wholesale_orders')
    .select('id, order_number, status, total, created_at, customer_id')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })
    .limit(30)

  // Fetch last paid order for post drafting
  const { data: lastPaidOrder } = await supabaseAdmin
    .from('wholesale_orders')
    .select('id, order_number, total, customer_id')
    .eq('business_id', business_id)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fetch last paid order items for post context
  let lastPaidItems: Array<{ name: string; quantity: number }> = []
  if (lastPaidOrder) {
    const { data: items } = await supabaseAdmin
      .from('wholesale_order_items')
      .select('name, quantity')
      .eq('order_id', lastPaidOrder.id)
      .limit(5)
    lastPaidItems = (items ?? []) as Array<{ name: string; quantity: number }>
  }

  // Fetch customer info for PII check
  const customerIds = [...new Set((orders ?? []).map((o: { customer_id: string | null }) => o.customer_id).filter(Boolean))]
  const { data: customers } = customerIds.length > 0
    ? await supabaseAdmin.from('customers').select('id, name, business_name, email, abn').in('id', customerIds as string[])
    : { data: [] }

  const customerList = (customers ?? []) as Array<{ id: string; name?: string | null; business_name?: string | null; email?: string | null; abn?: string | null }>

  // Stats
  const totalOrders = (orders ?? []).length
  const totalRevenue = (orders ?? []).filter((o: { status: string }) => ['confirmed', 'invoiced', 'sent', 'paid'].includes(o.status))
    .reduce((s: number, o: { total: number }) => s + (Number(o.total) || 0), 0)
  const pending = (orders ?? []).filter((o: { status: string }) => ['sent', 'partial'].includes(o.status)).length

  const result = await trackAICall(
    {
      route: 'wholesale/aria-intelligence',
      model: 'claude-haiku-4-5-20251001',
      businessId: business_id,
      purpose: 'wholesale intelligence',
    },
    async () => {
      const client = new Anthropic()

      const dataContext = {
        business: { name: biz.name, industry: biz.industry },
        orders_summary: { total: totalOrders, total_revenue: totalRevenue, pending_payment: pending },
        recent_orders: (orders ?? []).slice(0, 10).map((o: { order_number: string; status: string; total: number; created_at: string }) => ({
          order_number: o.order_number, status: o.status, total: o.total, date: o.created_at,
        })),
        last_shipped_products: lastPaidItems.map(i => i.name + ' x' + i.quantity),
      }

      async function generateWithPrivacyCheck(attempt: number): Promise<{ notices: string[]; actions: string[]; draft_post: { community: string; instagram: string; facebook: string } }> {
        const msg = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: WHOLESALE_POST_PRIVACY_RULES,
          messages: [{
            role: 'user',
            content: 'Based on this wholesale business data, produce JSON: {"notices": [string, string], "actions": [string, string], "draft_post": {"community": string, "instagram": string, "facebook": string}}\n\nBusiness data: ' + JSON.stringify(dataContext) + '\n\nFor draft_post, write social media posts celebrating a recent wholesale dispatch. Apply privacy rules strictly. Return valid JSON only.',
          }],
        })

        const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          return {
            notices: ['Wholesale orders are tracking well.', pending + ' orders pending payment.'],
            actions: ['Review outstanding orders.', 'Follow up on sent invoices.'],
            draft_post: { community: '', instagram: '', facebook: '' },
          }
        }

        const parsed = JSON.parse(jsonMatch[0])
        const draftPost = parsed.draft_post ?? { community: '', instagram: '', facebook: '' }

        // Privacy check
        const postTexts = [draftPost.community, draftPost.instagram, draftPost.facebook]
        const hasPII = postTexts.some(t => t && containsPII(t, customerList))

        if (hasPII && attempt < 2) {
          return generateWithPrivacyCheck(attempt + 1)
        }

        if (hasPII) {
          // Return generic fallback
          return {
            notices: parsed.notices ?? [],
            actions: parsed.actions ?? [],
            draft_post: {
              community: 'Excited to share that we just packed and shipped a chunky wholesale order! If you are interested in our wholesale program, reach out for a quote. We love working with like-minded stockists.',
              instagram: 'Packing day done. Another wholesale order out the door. We pour our heart into every product — and it means the world when wholesale partners choose us. DM for wholesale enquiries.',
              facebook: 'We have just dispatched a wholesale order and we could not be more proud of what we make. Interested in stocking our range? Get in touch to discuss wholesale pricing and minimum quantities.',
            },
          }
        }

        return {
          notices: parsed.notices ?? [],
          actions: parsed.actions ?? [],
          draft_post: draftPost,
        }
      }

      return generateWithPrivacyCheck(0)
    }
  )

  return NextResponse.json(result)
}

export const GET = withErrorCapture('wholesale/aria-intelligence', _GET)
