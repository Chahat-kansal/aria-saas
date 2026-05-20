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
      OPENAI_API_KEY_LENGTH: process.env.OPENAI_API_KEY?.length ?? 0,
      OPENAI_API_KEY_PREFIX: process.env.OPENAI_API_KEY?.slice(0, 7) ?? null,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER: !!process.env.TWILIO_PHONE_NUMBER,
      GOOGLE_PLACES_API_KEY: !!process.env.GOOGLE_PLACES_API_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  }

  // ACTUALLY TEST OPENAI - hit a cheap endpoint to verify the key works
  if (process.env.OPENAI_API_KEY) {
    try {
      // List models is free + tells us what models the key has access to
      const modelsRes = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(10_000),
      })
      const modelsText = await modelsRes.text()
      if (modelsRes.ok) {
        const data = JSON.parse(modelsText) as { data: Array<{ id: string }> }
        const imageModels = data.data
          .map(m => m.id)
          .filter(id => id.includes('dall-e') || id.includes('gpt-image'))
        tests.openai_models_test = {
          status: modelsRes.status,
          ok: true,
          image_capable_models: imageModels,
          total_models: data.data.length,
        }
      } else {
        tests.openai_models_test = {
          status: modelsRes.status,
          ok: false,
          error: modelsText.slice(0, 500),
        }
      }
    } catch (e) {
      tests.openai_models_test = { error: 'Exception: ' + String(e) }
    }

    // Try a TINY actual image generation
    try {
      const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'dall-e-3', prompt: 'a red circle', n: 1, size: '1024x1024' }),
        signal: AbortSignal.timeout(30_000),
      })
      const imgText = await imgRes.text()
      tests.openai_image_test = {
        status: imgRes.status,
        ok: imgRes.ok,
        response: imgRes.ok ? 'success - image generated' : imgText.slice(0, 500),
      }
    } catch (e) {
      tests.openai_image_test = { error: 'Exception: ' + String(e) }
    }
  }

  return NextResponse.json(tests, { headers: { 'Cache-Control': 'no-store' } })
}
