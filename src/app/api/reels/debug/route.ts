export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'

const FAL_KEY = process.env.FAL_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') ?? 'submit'
  const out: Record<string, any> = { fal_key_present: !!FAL_KEY, fal_key_len: FAL_KEY.length }

  if (action === 'submit') {
    // Submit a tiny test job
    try {
      const res = await fetch('https://queue.fal.run/fal-ai/kling-video/v2.1/pro/image-to-video', {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'test, woman smiling at camera, 9:16',
          image_url: 'https://d8j0ntlcm91z4.cloudfront.net/user_3Eal6Oeags0ToQcfhefc19bpPVl/hf_20260603_082106_7c8a3bba-f2cb-4c1d-aae5-5abc0e66a994.png',
          duration: '5',
          aspect_ratio: '9:16',
        }),
        signal: AbortSignal.timeout(20000),
      })
      const text = await res.text()
      out.submit_http = res.status
      out.submit_body = text
    } catch (e: any) { out.submit_error = e.message }
    return NextResponse.json(out)
  }

  if (action === 'status') {
    const statusUrl = req.nextUrl.searchParams.get('url')
    if (!statusUrl) return NextResponse.json({ error: 'url param required' })
    try {
      const res = await fetch(statusUrl, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(15000),
      })
      const text = await res.text()
      out.status_http = res.status
      out.status_body = text
    } catch (e: any) { out.status_error = e.message }
    return NextResponse.json(out)
  }

  return NextResponse.json({ error: 'unknown action' })
}
