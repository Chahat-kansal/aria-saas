import { NextResponse } from 'next/server'

// Minimal Google TTS-compatible endpoint for TalkingHead
// TalkingHead validates this URL exists at construction time.
// When we call speakAudio() instead of speakText(), this is never actually called.
// But it must return a valid response if called.
export async function POST() {
  // Return a minimal base64-encoded silent MP3 (44 bytes — smallest valid MP3 frame)
  const silentMp3Base64 = '//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'
  return NextResponse.json({
    audioContent: silentMp3Base64,
  })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
