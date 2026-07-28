import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { OwnerHeader } from '@/components/owner-app/Header'
import { OwnerBottomNav, OwnerHelpButton } from '@/components/owner-app/BottomNav'
import { OwnerBusinessProvider } from './OwnerBusinessContext'
import { BG } from '@/app/owner/theme'

// OWNER-APP PH-1 — /owner/[slug] resolves the URL slug to a business the same way public-by-slug
// routes already do (resolveBusinessId, src/lib/aria/resolve-business.ts), but this surface is
// AUTHENTICATED and owner-scoped, not public: verifies the signed-in user actually owns this
// business (businesses.user_id = auth.uid()) before rendering anything. No till/POS access here —
// this app never writes to the counter (RULE0: do not touch Canopy/POS/till code).
export default async function OwnerAppLayout({
  children, params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }> | { slug: string }
}) {
  const { slug } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const businessId = await resolveBusinessId(supabase, slug)
  if (!businessId) redirect('/dashboard')

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, slug, name, suburb, city')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) redirect('/dashboard') // not this user's business — fail closed, never leak existence

  const business = {
    id: biz.id as string,
    slug: (biz.slug as string) ?? slug,
    name: biz.name as string,
    suburb: (biz.suburb as string) ?? (biz.city as string) ?? null,
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'var(--font-body)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column' }}>
        <OwnerHeader businessName={business.name} suburb={business.suburb} />
        <OwnerBusinessProvider business={business}>
          <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
        </OwnerBusinessProvider>
        <OwnerBottomNav slug={business.slug} />
        <OwnerHelpButton />
      </div>
    </div>
  )
}
