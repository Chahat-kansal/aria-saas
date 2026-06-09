export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel

// Minimal silent MP3 stub — returned when ElevenLabs isn't configured so
// TalkingHead's URL-validation step still gets a valid audio response.
const SILENT_MP3_B64 = '//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'

/** GET ?check=1 → 200 if ElevenLabs is configured, 503 if not. */
export async function GET(req: NextRequest) {
  const check = req.nextUrl.searchParams.get('check')
  if (check) {
    const configured = !!process.env.ELEVENLABS_API_KEY
    return NextResponse.json({ configured }, { status: configured ? 200 : 503 })
  }
  // Fallback for TalkingHead validation ping
  return NextResponse.json({ ok: true })
}

/** POST { text } → ElevenLabs audio/mpeg, or silent stub if no key. */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY

  // No key → return silent stub so existing TalkingHead callers still work
  if (!apiKey) {
    return NextResponse.json({ audioContent: SILENT_MP3_B64 })
  }

  const body = await req.json().catch(() => ({})) as { text?: string }
  const text = (body.text ?? '').trim().slice(0, 500)
  if (!text) return NextResponse.json({ audioContent: SILENT_MP3_B64 })

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID

  const upstream = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + voiceId,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0 },
      }),
    }
  ).catch(() => null)

  if (!upstream?.ok) {
    const errText = upstream ? await upstream.text().catch(() => '') : 'fetch failed'
    console.error('[AriaVoice/ElevenLabs]', upstream?.status ?? 0, errText.slice(0, 200))
    // Graceful fallback: return silent stub so callers degrade to speechSynthesis
    return NextResponse.json({ audioContent: SILENT_MP3_B64 })
  }

  const audio = await upstream.arrayBuffer()
  return new NextResponse(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
}
