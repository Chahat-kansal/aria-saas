export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const FAL_KEY = process.env.FAL_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('j')
  if (!jobId) return NextResponse.json({ err: 'need ?j=jobid' })
  const out: Record<string, any> = { v: 'v2', key_len: FAL_KEY.length }
  try {
    const s = await fetch(`https://queue.fal.run/fal-ai/kling-video/requests/${jobId}/status`,
      { headers: { 'Authorization': `Key ${FAL_KEY}` }, signal: AbortSignal.timeout(10000) })
    out.status_http = s.status
    out.status_body = await s.text()
  } catch (e: any) { out.status_err = e.message }
  try {
    const r = await fetch(`https://queue.fal.run/fal-ai/kling-video/requests/${jobId}`,
      { headers: { 'Authorization': `Key ${FAL_KEY}` }, signal: AbortSignal.timeout(12000) })
    out.result_http = r.status
    out.result_body = (await r.text()).slice(0, 800)
  } catch (e: any) { out.result_err = e.message }
  return NextResponse.json(out)
}
