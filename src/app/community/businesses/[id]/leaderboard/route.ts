export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ id: string }> }

// CX-CLARITY-1 — see businesses/[id]/route.ts's own note: a Route Handler guarantees a real HTTP
// redirect, unlike the page-level redirect() this replaced.
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { data } = await supabaseAdmin.from('businesses').select('slug').eq('id', id).maybeSingle()
  if (!data?.slug) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.redirect(new URL(`/community/${data.slug}/leaderboard`, req.url), 308)
}
