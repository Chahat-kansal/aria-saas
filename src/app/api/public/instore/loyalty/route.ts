export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function isValidEmail(s: string) {
  return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(s)
}

export async function POST(req: Request) {
  try {
    const { business_id, email, name, conversation_id } = await req.json() as {
      business_id: string
      email: string
      name?: string
      conversation_id?: string
    }

    if (!business_id || !email) {
      return NextResponse.json({ error: 'business_id and email required' }, { status: 400 })
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const { data: config } = await supabaseAdmin
      .from('instore_kiosk_configs')
      .select('loyalty_enabled, enabled')
      .eq('business_id', business_id)
      .maybeSingle()

    if (config && (config.enabled === false || config.loyalty_enabled === false)) {
      return NextResponse.json({ error: 'Loyalty signup disabled' }, { status: 403 })
    }

    const { data: loyaltyConfig } = await supabaseAdmin
      .from('pos_loyalty_config')
      .select('program_type, stamps_to_reward, stamp_reward_text, points_per_dollar, point_value_cents')
      .eq('business_id', business_id)
      .maybeSingle()

    const stampsToReward = Number(loyaltyConfig?.stamps_to_reward ?? 10)
    const programType = loyaltyConfig?.program_type ?? 'points'

    // ── Existing customer? ───────────────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('pos_customers')
      .select('id, name, loyalty_points, points_balance, stamps_count, visit_count, total_spent, total_spend')
      .eq('business_id', business_id)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    let customer = existing
    let isNew = false

    if (!customer) {
      const { data: created, error: insertErr } = await supabaseAdmin.from('pos_customers').insert({
        business_id,
        email: email.toLowerCase().trim(),
        name: name?.trim() || null,
        loyalty_points: 0,
        points_balance: 0,
        stamps_count: 0,
        source: 'instore-kiosk',
        // CONSENT-COLLECTION-1: kiosk captures email for loyalty but asks no marketing opt-in —
        // record provenance only; channel consent stays false (DB default) until expressly given.
        consent_source: 'online',
      }).select('id, name, loyalty_points, points_balance, stamps_count, visit_count, total_spent, total_spend').single()

      if (insertErr || !created) {
        return NextResponse.json({ error: 'Could not create customer' }, { status: 500 })
      }
      customer = created
      isNew = true
    }

    // Link conversation to customer + record email captured
    if (conversation_id) {
      await supabaseAdmin.from('instore_conversations').update({
        customer_id: customer.id,
        email_captured: email.toLowerCase().trim(),
      }).eq('id', conversation_id).eq('business_id', business_id)
    }

    const points = Number(customer.points_balance ?? customer.loyalty_points ?? 0)
    const stamps = Number(customer.stamps_count ?? 0)
    const stampsLeft = Math.max(0, stampsToReward - stamps)

    let welcomeMessage: string
    if (isNew) {
      welcomeMessage = `You're in! Welcome to the rewards crew. ${programType === 'stamps' ? `Collect ${stampsToReward} stamps and we'll shout you ${loyaltyConfig?.stamp_reward_text ?? 'a freebie'}.` : 'Start earning points on your next visit.'}`
    } else {
      const visits = Number(customer.visit_count ?? 0)
      const name = customer.name ?? 'mate'
      if (programType === 'stamps') {
        welcomeMessage = stampsLeft === 0
          ? `Welcome back ${name}! You've earned a reward — let staff know to claim it.`
          : `Welcome back ${name}! You've got ${stamps} stamp${stamps === 1 ? '' : 's'} — ${stampsLeft} more for ${loyaltyConfig?.stamp_reward_text ?? 'a freebie'}.`
      } else {
        welcomeMessage = `Welcome back ${name}! You've got ${points} loyalty points${visits > 0 ? ` from ${visits} visit${visits === 1 ? '' : 's'}` : ''}.`
      }
    }

    return NextResponse.json({
      success: true,
      is_new: isNew,
      customer_id: customer.id,
      name: customer.name,
      points,
      stamps,
      stamps_left: stampsLeft,
      welcome_message: welcomeMessage,
    })
  } catch (err) {
    console.error('[instore/loyalty] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
