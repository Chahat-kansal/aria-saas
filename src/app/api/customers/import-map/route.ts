export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { waitUntil } from '@vercel/functions'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { businessId, fileName, headers, sampleRows } = body
  if (!businessId || !headers?.length) return NextResponse.json({ error: 'businessId and headers required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Create import job
  const { data: jobRow } = await supabaseAdmin.from('customer_import_jobs').insert({
    business_id: businessId,
    user_id: user.id,
    file_name: fileName ?? 'import.csv',
    raw_headers: headers,
    status: 'mapping',
  }).select('id').single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobId = (jobRow as any)?.id ?? ''

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  const prompt = `CSV headers: ${JSON.stringify(headers)}\nSample rows (first ${Math.min((sampleRows ?? []).length, 5)}): ${JSON.stringify((sampleRows ?? []).slice(0, 5))}\n\nMap each CSV header to the best matching customer field, or "ignore".\nAvailable fields: name, email, phone, company, address, city, postcode, notes, tags.\nReturn ONLY valid JSON: { "mapping": { "csvHeader": "customerField" } }`

  let mapping: Record<string, string> = {}
  let inputTokens = 0, outputTokens = 0, success = false

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      temperature: 0,
      system: 'You are a CSV column mapper. Return ONLY valid JSON, no preamble, no code fences.',
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content
      .filter((b: { type: string; text?: string }) => b.type === 'text')
      .map((b: { type: string; text?: string }) => b.text ?? '').join('')
    inputTokens = res.usage.input_tokens
    outputTokens = res.usage.output_tokens
    const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}')
    mapping = JSON.parse(clean.slice(s, e + 1)).mapping ?? {}
    success = true
  } catch (err) {
    console.error('[import-map] AI failed:', (err as Error).message)
  }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: businessId,
        agent_key: 'customer_import_map',
        provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929',
        role: 'import',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        success,
      })
    } catch (e) { console.error('[non-fatal]', e) }
  })())

  if (jobId) {
    await supabaseAdmin.from('customer_import_jobs').update({ column_mapping: mapping }).eq('id', jobId)
  }

  return NextResponse.json({ jobId, mapping })
}
