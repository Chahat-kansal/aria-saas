export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { WalletClient } from './WalletClient'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

export default async function WalletPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, slug, logo_url, community_cover_url')
    .eq('id', bid)
    .maybeSingle()
  if (!biz) notFound()

  // Top-up URL: link to the existing loyalty top-up flow
  const topUpUrl = '/loyalty/' + bid + '#topup'

  return (
    <WalletClient
      slug={slug}
      bizId={bid}
      bizName={(biz.name as string) ?? ''}
      logoUrl={(biz.logo_url as string | null) ?? null}
      topUpUrl={topUpUrl}
      heroImageUrl={(biz.community_cover_url as string | null) ?? null}
    />
  )
}