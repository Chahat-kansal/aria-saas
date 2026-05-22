export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    return NextResponse.json({
      image: {
        gemini_nano_banana: !!process.env.GEMINI_API_KEY,
        stability_ai: !!process.env.STABILITY_AI_KEY,
        dalle3: !!process.env.OPENAI_API_KEY,
        unsplash: !!process.env.UNSPLASH_ACCESS_KEY,
      },
      video: {
        runway: !!process.env.RUNWAY_API_KEY,
        replicate: !!process.env.REPLICATE_API_KEY,
      },
      voiceover: {
        elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export const GET = withErrorCapture('social/providers', _GET)
