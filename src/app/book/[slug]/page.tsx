'use client'
// BOOKINGS-CX-BUILD-1 — mount (b): the standalone public booking page. Re-skinned from the old
// Aria-POS green palette onto the shared Pipel components (see BOOKINGS-UI-SPEC.md Part 3 — the
// mockup's lime/cream is the Pipel system, not Aria-POS green). Same component, same API calls,
// as the CX tab mount at [slug]/booking — no duplicated markup, one implementation.
import { useParams } from 'next/navigation'
import { BookingFlow } from '@/components/booking/BookingFlow'

export default function BookingPage() {
  const slug = (useParams()?.slug as string) ?? ''
  return <BookingFlow slug={slug} />
}
