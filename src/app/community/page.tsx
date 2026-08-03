import Link from 'next/link'
import { getCommunityMember } from '@/lib/community/session'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { DiscoverFeed } from './DiscoverFeed'
import { PALETTE, BORDER, RADIUS, MAX_W } from './theme'

// CX-CLARITY-1 — café-first entry. A linked member's front door is their café, not a global feed:
//   - exactly one linked café  -> café card, then the global feed below (CX-CLARITY-2 replaced the
//     original redirect() here; see the note on that branch for why).
//   - multiple linked cafés    -> a simple picker, global feed (DiscoverFeed) below the fold.
//   - no session / zero links -> DiscoverFeed only, as today (just retitled "Discover" — see that
//     file's own note).
// Still a Server Component: getCommunityMember() reads the session cookie via next/headers, so the
// café branch is decided before any client-side feed fetch and there is no flash of the wrong shape.
export default async function CommunityEntryPage() {
  const member = await getCommunityMember()
  if (member) {
    const { data: links } = await supabaseAdmin
      .from('community_member_loyalty_links')
      .select('business_id, businesses(name, slug)')
      .eq('member_id', member.id)
    type LinkRow = { business_id: string; businesses: { name: string | null; slug: string | null } | null }
    const cafes = ((links ?? []) as unknown as LinkRow[]).filter(l => l.businesses?.slug)

    // CX-CLARITY-2 — one-café members used to be redirected straight to their café, which meant the
    // home tab (labelled "feed") never rendered a feed for them: the redirect fired before
    // DiscoverFeed mounted. Multi-café members already got a café list AND the feed below it; this
    // makes the single-café case the same shape rather than the odd one out. The café is still the
    // front door — it's just no longer the only thing reachable from here.
    //
    // Note the branch keys off community_member_loyalty_links, not community_follows, so it fired
    // even for an anonymous member following nobody — which is every member on the platform today.
    if (cafes.length === 1) {
      const cafe = cafes[0]
      return (
        <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px', color: PALETTE.ink }}>your café</h1>
          <div style={{ marginBottom: 24 }}>
            <Link href={`/community/${cafe.businesses!.slug}`} prefetch={false} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.lg,
              textDecoration: 'none', color: PALETTE.ink,
            }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{cafe.businesses!.name}</span>
              <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>→</span>
            </Link>
          </div>
          <DiscoverFeed />
        </main>
      )
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
