import { permanentRedirect, notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// CX-CLARITY-1 — this route's content moved to /community/[slug] (the same page, addressed by
// slug instead of uuid, so it's shareable/QR-able without exposing a raw id). Kept per RULE0 —
// nothing that already links here breaks; it now permanently redirects instead of rendering.
// force-dynamic: without it this dynamic-but-ungenerated route could be served from a stale
// build-time render instead of resolving the redirect on every request (found live — the deployed
// route was returning a 200 shell instead of actually redirecting).
type Params = { params: Promise<{ id: string }> }

export default async function LegacyBusinessProfileRedirect({ params }: Params) {
  const { id } = await params
  const { data } = await supabaseAdmin.from('businesses').select('slug').eq('id', id).maybeSingle()
  if (!data?.slug) notFound()
  permanentRedirect(`/community/${data.slug}`)
}
