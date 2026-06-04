export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const FAL_KEY = process.env.FAL_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' })

  const out: Record<string, any> = {}
  const statusUrl = `https://queue.fal.run/fal-ai/kling-video/requests/${jobId}/status`
  const resultUrl = `https://queue.fal.run/fal-ai/kling-video/requests/${jobId}`

  try {
    const s = await fetch(statusUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` }, signal: AbortSignal.timeout(10000) })
    out.status_http = s.status
    out.status_body = await s.text()
  } catch (e: any) { out.status_error = e.message }

  try {
    const r = await fetch(resultUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` }, signal: AbortSignal.timeout(12000) })
    out.result_http = r.status
    out.result_body = (await r.text()).slice(0, 1000)
  } catch (e: any) { out.result_error = e.message }

  return NextResponse.json(out)
}
