export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

// SECURITY-P1 (C-04) — this route had NO auth at all: any unauthenticated caller could trigger
// paid Anthropic calls and overwrite pos_products.description for ANY business by path. This is an
// owner-facing operation (regenerate AI menu copy), not a public one — now requires the caller to
// be signed in AND own the business (route uses "public/" in its path for historical/URL reasons,
// not because it's meant to be public).
export async function POST(_req: Request, { params }: Params) {
  const { business_id: idOrSlug } = 'then' in params ? await params : params
  const db = supabaseAdmin
  const business_id = await resolveBusinessId(db, idOrSlug)
  if (!business_id) return NextResponse.json({ updated: 0 })

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: owns } = await db.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: products } = await db.from('pos_products')
    .select('id, name, brand, price, alcohol_percentage, volume, container_type, country_of_origin')
    .eq('business_id', business_id).eq('is_active', true)
    .or('description.is.null,description.eq.').limit(20)
  if (!products?.length) return NextResponse.json({ updated: 0 })
  const list = products.map(p =>
    `ID:${p.id} — ${p.name}${p.brand ? ` by ${p.brand}` : ''}${p.alcohol_percentage ? `, ${p.alcohol_percentage}% ABV` : ''}${p.volume ? `, ${p.volume}ml` : ''}${p.country_of_origin ? `, from ${p.country_of_origin}` : ''}, $${p.price}`
  ).join('\n')
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{ role: 'user', content: `Write short enticing 1-sentence menu descriptions for these Australian retail/cafe products. Return ONLY a JSON array of objects with "id" and "description" fields. Max 80 chars each. No markdown.\n\n${list}` }],
  })
  const text = (resp.content[0] as { type: string; text: string }).text.replace(/```json|```/g, '').trim()
  let updated = 0
  try {
    const items: Array<{ id: string; description: string }> = JSON.parse(text)
    for (const item of items) {
      if (item.id && item.description) {
        await db.from('pos_products').update({ description: item.description.slice(0, 200) })
          .eq('id', item.id).eq('business_id', business_id)
        updated++
      }
    }
  } catch { return NextResponse.json({ updated: 0, error: 'Parse failed' }) }
  return NextResponse.json({ updated })
}
