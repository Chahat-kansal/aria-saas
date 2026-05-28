export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { HubClient, type HubBusiness } from './HubClient'

// Top-level route names that must never be treated as a business slug.
const RESERVED = new Set([
  'dashboard', 'admin', 'api', 'auth', 'book', 'businesses', 'community', 'contact', 'about',
  'demo', 'kiosk', 'login', 'loyalty', 'menu', 'monitoring', 'onboarding', 'pickup-display',
  'pos', 'pricing', 'print', 'privacy', 'profile', 'quote', 'receipt', 'security', 'share',
  'signup', 'staff', 'terms', 'track', 'visa', 'vs', 'in-store', 'data-deletion',
  'forgot-password', 'goodbye', 'install-chat', 'sitemap.xml', 'robots.txt', 'favicon.ico',
])

export default async function CustomerHubPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug || RESERVED.has(slug)) notFound()

  // Match by slug, falling back to a lowercased-name match for un-backfilled rows.
  let { data: biz } = await supabaseAdmin.from('businesses')
    .select('id, name, slug, city, suburb, community_bio, logo_url, community_verified, website, hub_visible_features, booking_link_slug, google_review_link, google_business_url')
    .eq('slug', slug).eq('is_active', true).maybeSingle()
  if (!biz) {
    const { data: byName } = await supabaseAdmin.from('businesses')
      .select('id, name, slug, city, suburb, community_bio, logo_url, community_verified, website, hub_visible_features, booking_link_slug, google_review_link, google_business_url')
      .ilike('name', slug).eq('is_active', true).maybeSingle()
    biz = byName
  }
  if (!biz) notFound()

  const features: string[] = Array.isArray(biz.hub_visible_features) ? biz.hub_visible_features as string[] : ['loyalty', 'booking', 'community', 'review', 'website']
  const reviewUrl = (biz.google_review_link as string | null) || (biz.google_business_url as string | null) || null

  const business: HubBusiness = {
    id: biz.id as string,
    name: (biz.name as string) ?? 'Our shop',
    slug: (biz.slug as string) ?? slug,
    city: (biz.suburb as string | null) ?? (biz.city as string | null) ?? null,
    bio: (biz.community_bio as string | null) ?? null,
    logoUrl: (biz.logo_url as string | null) ?? null,
    verified: !!biz.community_verified,
    features,
    bookingSlug: (biz.booking_link_slug as string | null) ?? null,
    website: (biz.website as string | null) ?? null,
    reviewUrl,
  }

  return <HubClient business={business} />
}
