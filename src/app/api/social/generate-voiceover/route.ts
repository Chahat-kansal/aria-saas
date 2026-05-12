export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL' // ElevenLabs Rachel — multilingual

async function _POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const key = process.env.ELEVENLABS_API_KEY
    if (!key) {
      return NextResponse.json(
        { error: 'ElevenLabs not configured. Add ELEVENLABS_API_KEY to your environment.' },
        { status: 503 }
      )
    }

    const { text, voice_id, business_id } = await req.json() as {
      text?: string; voice_id?: string; business_id?: string
    }
    if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })
    if (text.length > 2500) return NextResponse.json({ error: 'Text too long (max 2500 chars)' }, { status: 400 })

    const voice = voice_id || DEFAULT_VOICE
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
    })

    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText)
      return NextResponse.json({ error: `ElevenLabs error: ${msg}` }, { status: 502 })
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer())
    const filename = `voiceover/${business_id ?? user.id}/${Date.now()}.mp3`

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { error: uploadError } = await sb.storage
      .from('media')
      .upload(filename, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 })
    }

    const publicUrl = sb.storage.from('media').getPublicUrl(filename).data.publicUrl
    return NextResponse.json({ audio_url: publicUrl, voice_id: voice })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export const POST = withErrorCapture('social/generate-voiceover', _POST)
