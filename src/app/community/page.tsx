import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCommunityMember } from '@/lib/community/session'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { DiscoverFeed } from './DiscoverFeed'
import { PALETTE, BORDER, RADIUS, MAX_W } from './theme'

// CX-CLARITY-1 — café-first entry. A linked member's front door is their café, not a global feed:
//   - exactly one linked café  -> redirect straight there (session-dependent, so a plain redirect()
//     — 307 — not permanentRedirect(); which café this resolves to can change if links change).
//   - multiple linked cafés    -> a simple picker, global feed (DiscoverFeed) below the fold.
//   - no session / zero links -> DiscoverFeed only, as today (just retitled "Discover" — see that
//     file's own note).
// This is a Server Component specifically so the redirect happens before any client-side feed
// fetch/flash — getCommunityMember() already works server-side (reads the cookie via next/headers).
export default async function CommunityEntryPage() {
  const member = await getCommunityMember()
  if (member) {
    const { data: links } = await supabaseAdmin
      .from('community_member_loyalty_links')
      .select('business_id, businesses(name, slug)')
      .eq('member_id', member.id)
    type LinkRow = { business_id: string; businesses: { name: string | null; slug: string | null } | null }
    const cafes = ((links ?? []) as unknown as LinkRow[]).filter(l => l.businesses?.slug)

    if (cafes.length === 1) {
      redirect(`/community/${cafes[0].businesses!.slug}`)
    }
    if (cafes.length > 1) {
      return (
        <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px', color: PALETTE.ink }}>your cafés</h1>
          <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: '0 0 16px' }}>You&rsquo;re a member at {cafes.length} places on Aria.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {cafes.map(c => (
              <Link key={c.business_id} href={`/community/${c.businesses!.slug}`} prefetch={false} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.lg,
                textDecoration: 'none', color: PALETTE.ink,
              }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{c.businesses!.name}</span>
                <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>→</span>
              </Link>
            ))}
          </div>
          <DiscoverFeed />
        </main>
      )
    }
  }

  return <DiscoverFeed />
}
