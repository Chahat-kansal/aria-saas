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
