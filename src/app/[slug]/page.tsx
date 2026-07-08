export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'
import { resolveCxCustomer } from '@/lib/cx/resolve-cx-customer'
import { HubClient, type HubBusiness, type CxCustomer } from './HubClient'

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

  type ProdRow = { id: string; name: string; price: number; image_url: string | null; description: string | null }
  type PostRow = { title: string | null; body: string | null; media_urls: string[] | null }

  const [productsRes, rewardRes, postsRes] = await Promise.all([
    supabaseAdmin
      .from('pos_products')
      .select('id, name, price, image_url, description')
      .eq('business_id', biz.id as string)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('featured', { ascending: false, nullsFirst: false })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name')
      .limit(6),
    supabaseAdmin
      .from('loyalty_reward_rules')
      .select('threshold_value')
      .eq('business_id', biz.id as string)
      .eq('is_active', true)
      .not('threshold_value', 'is', null)
      .order('threshold_value', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('community_posts')
      .select('title, body, media_urls')
      .eq('business_id', biz.id as string)
      .eq('status', 'published')
      .not('media_urls', 'is', null)
      .order('published_at', { ascending: false })
      .limit(2),
  ])

  const products: ProdRow[] = (productsRes.data ?? []) as ProdRow[]
  const rewardThreshold: number | null = (rewardRes.data as { threshold_value?: number | null } | null)?.threshold_value ?? null
  const posts: PostRow[] = (postsRes.data ?? []) as PostRow[]

  // Hero: first published post with media
  const heroPost = posts[0] ?? null
  const heroImageUrl: string | null = (heroPost?.media_urls ?? [])[0] ?? null

  // "What's new" card: use same post (or second post if available)
  const newsPost = posts[0] ?? null
  const latestPost: HubBusiness['latestPost'] = newsPost ? {
    title: newsPost.title ?? '',
    excerpt: (newsPost.body ?? '').slice(0, 120),
    imageUrl: (newsPost.media_urls ?? [])[0] ?? null,
  } : null

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
    products,
    rewardThreshold,
    heroImageUrl,
    latestPost,
  }

  // Fire-and-forget hub visit tracking
  void supabaseAdmin.from('customer_hub_clicks').insert({
    business_id: biz.id,
    target: 'hub_view',
    visitor_id: null,
    referrer: null,
    user_agent: null,
  })

  // Session-gated customer data for hero/pill
  const session = await getCxSessionServer(biz.id as string)
  let initialCustomer: CxCustomer | null = null
  if (session) {
    const cRow = await resolveCxCustomer<{
      id: string; name: string | null; points_balance: number | null; loyalty_tier: string | null
      visit_count: number | null; stamps_count: number | null; total_spent: string | null
      last_visit_at: string | null; loyalty_identity_id: string | null
    }>(session.identity_id, biz.id as string, 'id, name, points_balance, loyalty_tier, visit_count, stamps_count, total_spent, last_visit_at, loyalty_identity_id')
    if (cRow) {
      const c = cRow as {
        id: string; name: string | null; points_balance: number | null; loyalty_tier: string | null
        visit_count: number | null; stamps_count: number | null; total_spent: string | null
        last_visit_at: string | null; loyalty_identity_id: string | null
      }
      const [walletRes, usualRes] = await Promise.all([
        supabaseAdmin
          .from('loyalty_preload_accounts')
          .select('balance, currency')
          .eq('business_id', biz.id as string)
          .eq('customer_id', c.id)
          .maybeSingle(),
        supabaseAdmin
          .from('pos_online_orders')
          .select('items')
          .eq('business_id', biz.id as string)
          .eq('customer_id', c.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      const walletData = walletRes.data as { balance?: number | null; currency?: string | null } | null
      let usualProduct: CxCustomer['usual_product'] = null
      const items = ((usualRes.data as { items?: unknown[] } | null)?.items ?? []) as Array<{
        product_name?: string; unit_price?: number; product_id?: string; image_url?: string | null
      }>
      if (items[0]?.product_name) {
        const first = items[0]
        usualProduct = {
          name: first.product_name ?? '',
          price: Number(first.unit_price ?? 0),
          image_url: first.image_url ?? null,
          product_id: first.product_id ?? null,
        }
      }
      initialCustomer = {
        customer_id: c.id,
        name: c.name ?? '',
        points_balance: Number(c.points_balance) || 0,
        loyalty_tier: c.loyalty_tier ?? null,
        visit_count: Number(c.visit_count) || 0,
        stamps_count: Number(c.stamps_count) || 0,
        total_spent: (Number(c.total_spent) || 0).toFixed(2),
        loyalty_identity_id: c.loyalty_identity_id ?? null,
        wallet_balance: Number(walletData?.balance ?? 0),
        wallet_currency: walletData?.currency ?? 'AUD',
        challenges: [],
        recent_txns: [],
        preload_txns: [],
        usual_product: usualProduct,
      }
    }
  }

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
      <HubClient business={business} initialCustomer={initialCustomer} />
    </>
  )
}