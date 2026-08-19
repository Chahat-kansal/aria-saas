// MS7-PRE phase 2 — this route must NOT be prerendered.
//
// It was the ONLY statically-generated route in the app: 1 of 1,198 API routes, confirmed from the
// build's own route table (`○ /api/aria/avatar` against `ƒ` for every other one). Being prerendered
// meant Next executed this GET AT BUILD TIME, which downloads a multi-megabyte .glb from
// raw.githubusercontent.com over the network as part of `next build`.
//
// That made the build network-dependent, and on 2026-08-18 it failed exactly that way: three
// 60-second static-generation attempts timed out and the whole build exited 1, on a commit that
// touched only CLAUDE.md. A flake that can redden any commit, including in CI, from a route nobody
// changed.
//
// BEHAVIOUR CHANGE, stated plainly: the route stops being prerendered and is served per-request.
// The avatar is now fetched when a browser asks for it rather than once at build time. The upstream
// fetch already uses `cache: 'force-cache'`, so Next still caches the bytes after the first request
// — the cost is one cold fetch on the first hit after a deploy, not a fetch per request.
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

const BRUNETTE = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'

// Server-side fetch has no CORS restrictions.
// We proxy the bytes back so the browser only talks to ariaos.site — no CORS issues.
async function fetchGlb(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch { return null }
}

export async function GET() {
  let buf: ArrayBuffer | null = null
  let source = 'brunette'

  // 1. Try NEXT_PUBLIC_ARIA_AVATAR_URL env var (explicit URL)
  const explicit = process.env.NEXT_PUBLIC_ARIA_AVATAR_URL
  if (explicit?.startsWith('http')) {
    buf = await fetchGlb(explicit)
    if (buf) source = 'env-var'
  }

  // 2. Try listing Blob store
  if (!buf && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = await import('@vercel/blob')
      const { blobs } = await list({ prefix: 'Aria' })
      const glb = blobs.find(b => b.pathname.toLowerCase().endsWith('.glb'))
      if (glb?.url) {
        buf = await fetchGlb(glb.url)
        if (buf) source = 'blob-store'
      }
    } catch (e) {
      console.error('[avatar] blob list error:', e)
    }
  }

  // 3. Fallback to brunette.glb
  if (!buf) {
    buf = await fetchGlb(BRUNETTE)
    source = 'brunette-fallback'
  }

  if (!buf) {
    return new NextResponse('Avatar not found', { status: 404 })
  }

  console.log(`[avatar] serving ${source} (${buf.byteLength} bytes)`)

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'model/gltf-binary',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
