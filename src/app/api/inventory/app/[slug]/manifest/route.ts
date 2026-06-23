export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

// INV-STAFF-APP-1 — per-business web manifest so the staff PWA installs to the homescreen as a standalone
// app named "<Business> Inventory", scoped to /inventory/<slug>.
type Params = { params: Promise<{ slug: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params
  let name = 'Inventory'
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (bid) {
    const { data } = await supabaseAdmin.from('businesses').select('name').eq('id', bid).maybeSingle()
    if (data?.name) name = `${data.name} Inventory`
  }
  const start = `/inventory/${slug}`
  return NextResponse.json({
    name, short_name: name.length > 12 ? 'Inventory' : name,
    start_url: start, scope: start, display: 'standalone', orientation: 'portrait',
    background_color: '#2D5240', theme_color: '#2D5240',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json' } })
}
