export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const business_id = searchParams.get('business_id')
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

    const [cfgRes, bizRes] = await Promise.all([
      supabaseAdmin.from('instore_kiosk_configs')
        .select('kiosk_name, greeting, personality, voice_enabled, loyalty_enabled, recipe_suggestions, enabled')
        .eq('business_id', business_id)
        .maybeSingle(),
      supabaseAdmin.from('businesses').select('name, industry').eq('id', business_id).maybeSingle(),
    ])

    const cfg = cfgRes.data
    if (cfg && cfg.enabled === false) {
      return NextResponse.json({ enabled: false }, { status: 200 })
    }

    return NextResponse.json({
      enabled: true,
      kiosk_name: cfg?.kiosk_name ?? 'Aria',
      greeting: cfg?.greeting ?? `Hi! I'm here to help — ask anything about ${bizRes.data?.name ?? 'the shop'}.`,
      personality: cfg?.personality ?? 'friendly',
      voice_enabled: cfg?.voice_enabled !== false,
      loyalty_enabled: cfg?.loyalty_enabled !== false,
      recipe_suggestions: cfg?.recipe_suggestions !== false,
      industry: (bizRes.data as { industry?: string | null } | null)?.industry ?? null,
    })
  } catch (err) {
    console.error('[instore/config] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
