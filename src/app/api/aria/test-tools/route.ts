export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized — log into ariaos.site first' }, { status: 401 })

  const tests: Record<string, unknown> = {
    env_status: {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      OPENAI_API_KEY_PREFIX: process.env.OPENAI_API_KEY?.slice(0, 7) ?? null,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      GEMINI_API_KEY_PREFIX: process.env.GEMINI_API_KEY?.slice(0, 6) ?? null,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      CLICKSEND_USERNAME: !!process.env.CLICKSEND_USERNAME,
      CLICKSEND_API_KEY: !!process.env.CLICKSEND_API_KEY,
      SERPER_API_KEY: !!process.env.SERPER_API_KEY,
      GOOGLE_PLACES_API_KEY: !!process.env.GOOGLE_PLACES_API_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  }

  // Test OpenAI with correct model (gpt-image-1, not dall-e-3)
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt: 'a red circle', n: 1, size: '1024x1024' }),
        signal: AbortSignal.timeout(30_000),
      })
      const txt = await res.text()
      tests.openai_gpt_image_1_test = { status: res.status, ok: res.ok, response: res.ok ? 'success' : txt.slice(0, 300) }
    } catch (e) { tests.openai_gpt_image_1_test = { error: String(e) } }
  }

  // Test Imagen 3 via Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instances: [{ prompt: 'a red circle' }], parameters: { sampleCount: 1 } }),
          signal: AbortSignal.timeout(30_000),
        }
      )
      const txt = await res.text()
      tests.imagen_3_test = { status: res.status, ok: res.ok, response: res.ok ? 'success — Imagen 3 working' : txt.slice(0, 500) }
    } catch (e) { tests.imagen_3_test = { error: String(e) } }
  }

  return NextResponse.json(tests, { headers: { 'Cache-Control': 'no-store' } })
}
