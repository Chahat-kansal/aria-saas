export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const FAL_KEY = process.env.FAL_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('s')
  if (s !== 'diag9') return NextResponse.json({ error: 'no' }, { status: 403 })
  const jobId = req.nextUrl.searchParams.get('j')
  if (!jobId) return NextResponse.json({ error: 'need j' })

  const out: Record<string, any> = {}
  // The generic requests URL fal.ai returns (no model path) is the canonical one
  const urls = {
    generic: `https://queue.fal.run/fal-ai/kling-video/requests/${jobId}`,
  }
  for (const [k, u] of Object.entries(urls)) {
    try {
      const r = await fetch(u, { headers: { 'Authorization': `Key ${FAL_KEY}` }, signal: AbortSignal.timeout(12000) })
      out[k] = { http: r.status, body: (await r.text()).slice(0, 500) }
    } catch (e: any) { out[k] = { err: e.message } }
  }
  return NextResponse.json(out)
}
