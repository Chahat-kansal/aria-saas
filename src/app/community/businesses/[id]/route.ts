export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ id: string }> }

// CX-CLARITY-1 — this route's content moved to /community/[slug]. A prior version of this fix used
// a Server Component page calling permanentRedirect(), which live-tested as HTTP 200 with a full
// rendered body instead of a real 308 — a Server Component redirect() can get absorbed into the RSC
// stream instead of surfacing as a true HTTP status if anything upstream (shared layout, client
// boundary) starts streaming first. A Route Handler never renders React, so NextResponse.redirect()
// is a guaranteed literal HTTP redirect — no RSC ambiguity possible.
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { data } = await supabaseAdmin.from('businesses').select('slug').eq('id', id).maybeSingle()
  if (!data?.slug) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.redirect(new URL(`/community/${data.slug}`, req.url), 308)
}
