import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveBusinessId as resolveBusinessIdWith } from '@/lib/aria/resolve-business'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveMembership } from '@/lib/access/membership'

/** Slug→id via service role: a member cannot read `businesses` under RLS, and this returns an id only. */
async function resolveBusinessIdAdmin(slug: string) { return resolveBusinessIdWith(supabaseAdmin, slug) }
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

  const businessId = await resolveBusinessIdAdmin(slug)
  if (!businessId) redirect('/dashboard')

  // ACCESS-MODEL-1 — the owner app is no longer owner-only: a LINKED MEMBER (manager) may open it.
  // `businesses` is deliberately NOT RLS-widened, because that row carries billing and identity
  // fields a manager must never see (stripe_customer_id, stripe_subscription_id, plan,
  // trial_ends_at, owner_email, ABN). Instead membership is resolved server-side and the member is
  // handed a BILLING-SAFE PROJECTION — {id, slug, name, suburb} and nothing else. The owner's own
  // access is unchanged; this only adds a second, narrower door.
  const membership = await resolveMembership(user.id, businessId)
  if (!membership) redirect('/dashboard') // neither owner nor linked member — fail closed

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, slug, name, suburb, city')   // ← the projection: no billing/identity columns
    .eq('id', businessId)
    .maybeSingle()
  if (!biz) redirect('/dashboard')

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
