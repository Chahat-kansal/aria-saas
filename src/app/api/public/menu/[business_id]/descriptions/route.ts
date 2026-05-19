export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function POST(_req: Request, { params }: Params) {
  const { business_id } = 'then' in params ? await params : params
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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
