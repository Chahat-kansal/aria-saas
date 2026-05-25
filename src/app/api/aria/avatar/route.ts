import { NextResponse } from 'next/server'
import { list } from '@vercel/blob'

export async function GET() {
  try {
    // List all blobs with Aria prefix — finds the file regardless of hash suffix
    const { blobs } = await list({ prefix: 'Aria' })
    const glb = blobs.find(b => b.pathname.toLowerCase().endsWith('.glb'))

    const sourceUrl = glb?.url
      ?? 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'

    const res = await fetch(sourceUrl)
    if (!res.ok) throw new Error(`fetch ${sourceUrl} → ${res.status}`)

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e) {
    console.error('[api/aria/avatar]', e)
    // Hard fallback redirect
    return NextResponse.redirect(
      'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'
    )
  }
}
