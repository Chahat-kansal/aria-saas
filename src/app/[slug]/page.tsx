export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
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

/** Direct DB read — avoids an HTTP round-trip to own API */
async function fetchBizForMeta(slug: string) {
  const { data } = await supabaseAdmin.from('businesses')
    .select('name, slug, suburb, city, community_bio, logo_url, website, google_business_url')
    .eq('slug', slug).eq('is_active', true).maybeSingle()
  return data
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (RESERVED.has(slug)) return { title: 'Aria' }

  const biz = await fetchBizForMeta(slug)
  if (!biz) return { title: 'Aria' }

  const locality = (biz.suburb as string | null) ?? (biz.city as string | null) ?? ''
  const title = locality ? (biz.name as string) + ' — ' + locality : (biz.name as string)
  const bio = biz.community_bio as string | null
  const description = bio ? bio.slice(0, 160) : ('Visit ' + (biz.name as string) + (locality ? ' in ' + locality : '') + ' — order, book, and earn loyalty points online.')
  const canonicalUrl = 'https://www.ariaos.site/' + (biz.slug as string ?? slug)
  const logoUrl = biz.logo_url as string | null

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      ...(logoUrl ? { images: [{ url: logoUrl }] } : {}),
    },
    twitter: { card: 'summary', title, description },
  }
}

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

  // Fire-and-forget hub visit tracking (non-blocking)
  void supabaseAdmin.from('customer_hub_clicks').insert({
    business_id: biz.id,
    target: 'hub_view',
    visitor_id: null,
    referrer: null,
    user_agent: null,
  })

  // Rich LocalBusiness JSON-LD — server-rendered, visible to GPTBot/ClaudeBot/PerplexityBot
  // Only include fields with real values — no empty/placeholder properties
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    url: 'https://www.ariaos.site/' + business.slug,
  }
  if (business.logoUrl) { jsonLd.image = business.logoUrl; jsonLd.logo = business.logoUrl }
  if (business.city) jsonLd.address = { '@type': 'PostalAddress', addressLocality: business.city, addressCountry: 'AU' }
  if (business.bio) jsonLd.description = business.bio
  const sameAs = [business.website, biz.google_business_url as string | null].filter(Boolean)
  if (sameAs.length > 0) jsonLd.sameAs = sameAs

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HubClient business={business} />
    </>
  )
}
