export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { AccountClient } from './AccountClient'

export default async function AccountPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, logo_url')
    .eq('id', bid)
    .maybeSingle()
  if (!biz) notFound()

  return (
    <AccountClient
      slug={slug}
      bizId={bid}
      bizName={(biz.name as string) ?? ''}
      logoUrl={(biz.logo_url as string | null) ?? null}
    />
  )
}