import { permanentRedirect, notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// CX-CLARITY-1 — moved to /community/[slug]/leaderboard. See businesses/[id]/page.tsx's own note.
type Params = { params: Promise<{ id: string }> }

export default async function LegacyLeaderboardRedirect({ params }: Params) {
  const { id } = await params
  const { data } = await supabaseAdmin.from('businesses').select('slug').eq('id', id).maybeSingle()
  if (!data?.slug) notFound()
  permanentRedirect(`/community/${data.slug}/leaderboard`)
}
