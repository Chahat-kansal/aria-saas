import { NextResponse } from 'next/server'

const BRUNETTE = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'

export async function GET() {
  // 1. Explicit env var — fastest path, use if set
  const explicit = process.env.NEXT_PUBLIC_ARIA_AVATAR_URL
  if (explicit && explicit.startsWith('http') && !explicit.includes('403')) {
    return NextResponse.redirect(explicit)
  }

  // 2. Try listing Blob store if token available
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = await import('@vercel/blob')
      const { blobs } = await list({ prefix: 'Aria' })
      const glb = blobs.find(b => b.pathname.toLowerCase().endsWith('.glb'))
      if (glb?.url) {
        console.log('[avatar] found blob:', glb.pathname, glb.url)
        return NextResponse.redirect(glb.url)
      }
    } catch (e) {
      console.error('[avatar] blob list failed:', e)
    }
  }

  // 3. Fallback — redirect to TalkingHead sample avatar
  console.log('[avatar] using brunette fallback')
  return NextResponse.redirect(BRUNETTE)
}
