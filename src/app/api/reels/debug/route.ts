export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const FAL_KEY = process.env.FAL_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('job_id')
  const model = req.nextUrl.searchParams.get('model') ?? 'fal-ai/kling-video/v2.1/pro/image-to-video'
  if (!jobId) return NextResponse.json({ error: 'job_id required' })

  const results: Record<string, any> = {}

  // Try status
  try {
    const r = await fetch(`https://queue.fal.run/${model}/requests/${jobId}/status`, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
      signal: AbortSignal.timeout(8000),
    })
    const text = await r.text()
    results.status_http = r.status
    results.status_body = text.slice(0, 500)
    
    if (r.ok) {
      const d = JSON.parse(text)
      results.fal_status = d.status
      
      // If completed, get result
      if ((d.status ?? '').toUpperCase() === 'COMPLETED') {
        const r2 = await fetch(`https://queue.fal.run/${model}/requests/${jobId}`, {
          headers: { 'Authorization': `Key ${FAL_KEY}` },
          signal: AbortSignal.timeout(10000),
        })
        const t2 = await r2.text()
        results.result_http = r2.status
        results.result_body = t2.slice(0, 500)
      }
    }
  } catch (e: any) {
    results.error = e.message
  }

  return NextResponse.json(results)
}
