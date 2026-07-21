'use client'
// BOOKINGS-CX-BUILD-1 — mount (a): the booking flow inside the [slug]/ CX app (reached via the
// tab bar's "More" overlay, since the bar's 4 main slots are fixed — see CxTabBar.tsx). Same
// component as the standalone /book/[slug] page, just with the tab bar shown underneath it.
import { useParams } from 'next/navigation'
import { BookingFlow } from '@/components/booking/BookingFlow'

export default function CxBookingPage() {
  const slug = (useParams()?.slug as string) ?? ''
  return <BookingFlow slug={slug} withTabBar />
}
