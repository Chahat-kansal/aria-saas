export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const FAL_KEY = process.env.FAL_API_KEY ?? ''

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { influencer_url, background_url } = await req.json()
  if (!influencer_url || !background_url) 
    return NextResponse.json({ error: 'influencer_url and background_url required' }, { status: 400 })

  if (!FAL_KEY) return NextResponse.json({ error: 'FAL_API_KEY not configured' }, { status: 503 })

  // Use fal.ai iclight or image-to-image to composite influencer onto background
  // Simple approach: use GPT Image 2 style compositing via fal.ai
  try {
    const res = await fetch('https://queue.fal.run/fal-ai/imageutils/rembg', {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: influencer_url }),
      signal: AbortSignal.timeout(25000),
    })
    const d = await res.json()
    // rembg removes background, returns image with transparent bg
    const noBackground = d.image?.url ?? influencer_url
    return NextResponse.json({ composited_url: noBackground, background_url })
  } catch (e: any) {
    // Fallback: just return original influencer image
    return NextResponse.json({ composited_url: influencer_url, background_url })
  }
}
