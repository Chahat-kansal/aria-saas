export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { put } from '@vercel/blob'

// fal.ai calls this when a job finishes. No user auth (fal isn't logged in);
// we verify by matching request_id against a real job in our DB.
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 }) // ack anyway so fal stops retrying
  }

  const requestId = body?.request_id ?? body?.gateway_request_id
  const status = body?.status   // "OK" or "ERROR"
  console.log('[reels/fal-webhook] request_id:', requestId, 'status:', status, JSON.stringify(body?.payload ?? {}).slice(0, 200))

  if (!requestId) return NextResponse.json({ ok: false }, { status: 200 })

  // ── V2V job completion (reel_v2v_jobs) ─────────────────────────────────────
  const { data: v2vJob } = await supabaseAdmin
    .from('reel_v2v_jobs')
    .select('id, status')
    .eq('fal_job_id', requestId)
    .maybeSingle()

  if (v2vJob) {
    if (status === 'ERROR') {
      await supabaseAdmin.from('reel_v2v_jobs')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', v2vJob.id)
      return NextResponse.json({ ok: true }, { status: 200 })
    }
    const p = body?.payload ?? {}
    const rawUrl: string | null =
      p?.video?.url ?? p?.output?.video?.url ?? p?.video_url ?? p?.videos?.[0]?.url ??
      (typeof p?.video === 'string' ? p.video : null)

    if (rawUrl) {
      // Copy to Vercel Blob so the URL doesn't expire
      let blobUrl = rawUrl
      try {
        const videoRes = await fetch(rawUrl, { signal: AbortSignal.timeout(30000) })
        const arrayBuf = await videoRes.arrayBuffer()
        const { url } = await put('reels/v2v/' + v2vJob.id + '.mp4', Buffer.from(arrayBuf), {
          access: 'public',
          contentType: 'video/mp4',
        })
        blobUrl = url
      } catch (blobErr) {
        console.error('[fal-webhook] blob copy failed for v2v job', v2vJob.id, blobErr)
        // Still store the raw fal URL as fallback (will expire, but better than nothing)
      }
      await supabaseAdmin.from('reel_v2v_jobs')
        .update({ status: 'done', output_url: blobUrl, updated_at: new Date().toISOString() })
        .eq('id', v2vJob.id)
      console.log('[fal-webhook] v2v job', v2vJob.id, 'complete ->', blobUrl.slice(0, 80))
    }
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // ── Existing: reel_studio_sessions completion ───────────────────────────────
  // Find the matching session — this is the verification: must be a real job we created
  const { data: session } = await supabaseAdmin.from('reel_studio_sessions')
    .select('id, status').eq('higgsfield_job_id', requestId).maybeSingle()

  if (!session) {
    console.error('[reels/fal-webhook] no session for request_id:', requestId)
    return NextResponse.json({ ok: true }, { status: 200 }) // ack; nothing to do
  }

  if (status === 'ERROR') {
    await supabaseAdmin.from('reel_studio_sessions')
      .update({ status: 'failed' }).eq('id', session.id)
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // status OK — pull the video URL directly from the payload (no result fetch needed)
  const p = body?.payload ?? {}
  const videoUrl =
    p?.video?.url ??
    p?.output?.video?.url ??
    p?.video_url ??
    p?.videos?.[0]?.url ??
    (typeof p?.video === 'string' ? p.video : null)

  if (!videoUrl) {
    console.error('[reels/fal-webhook] OK but no video url in payload:', JSON.stringify(p).slice(0, 300))
    // Leave as processing — the page's DB poll + status route can still resolve it
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  await supabaseAdmin.from('reel_studio_sessions').update({
    status: 'completed',
    video_url: videoUrl,
    completed_at: new Date().toISOString(),
  }).eq('id', session.id)

  console.log('[reels/fal-webhook] completed session', session.id, '→', videoUrl.slice(0, 80))
  return NextResponse.json({ ok: true }, { status: 200 })
}
