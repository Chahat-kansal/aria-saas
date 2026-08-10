export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import JourneyPlayer from '@/components/display/JourneyPlayer'

// ARIA-DISPLAY-1 — the customer display shell. Public, no auth, no writes.
//
// THIS SCREEN IS VISIBLE TO EVERY CUSTOMER IN THE SHOP, so it is handed exactly two strings: the
// venue's display name and its timezone. No totals, no order, no customer data, no PII. Widening
// this select is a security decision, not a convenience one.
//
// Resolution follows the existing public per-slug pattern (see [slug]/onboarding/page.tsx):
// resolveBusinessId via supabaseAdmin, then a narrow select. Service-role is correct here — the
// page is deliberately unauthenticated, so there is no user session for RLS to scope against, and
// the only columns read are ones already public on the CX hub.
//
// NO notFound(). A 404 on a shop counter is worse than a nice video with no name on it — an
// unresolved slug still gets the journey, just unbranded.

export default async function DisplayPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()

  let venueName = ''
  let timeZone = 'Australia/Melbourne'

  if (slug) {
    const bid = await resolveBusinessId(supabaseAdmin, slug)
    if (bid) {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('name, timezone')
        .eq('id', bid)
        .maybeSingle()
      if (biz) {
        venueName = (biz.name as string | null) ?? ''
        timeZone = (biz.timezone as string | null) || timeZone
      }
    }
  }

  return <JourneyPlayer venueName={venueName} timeZone={timeZone} />
}
