import { permanentRedirect, notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'

// CX-CLARITY-1 — this route's content moved to /community/[slug] (the same page, addressed by
// slug instead of uuid, so it's shareable/QR-able without exposing a raw id). Kept per RULE0 —
// nothing that already links here breaks; it now permanently redirects instead of rendering.
type Params = { params: Promise<{ id: string }> }

export default async function LegacyBusinessProfileRedirect({ params }: Params) {
  const { id } = await params
  const { data } = await supabaseAdmin.from('businesses').select('slug').eq('id', id).maybeSingle()
  if (!data?.slug) notFound()
  permanentRedirect(`/community/${data.slug}`)
}
