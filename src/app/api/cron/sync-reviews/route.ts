export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
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
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
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
    } catch { /* continue */ }
  }

  return NextResponse.json({
    ok: true,
    businesses_synced: businesses?.length ?? 0,
    total_synced,
  })
}