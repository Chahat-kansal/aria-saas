import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { AriaEmailLayout, ARIA_EMAIL } from './AriaEmailLayout'

// B28-REACT-EMAIL — the One-Click unsubscribe confirmation PAGE (HTTP HTML response, not a sent
// email). Same wording as before: confirms marketing opt-out, notes transactional messages continue.
export function UnsubscribedPage() {
  return (
    <AriaEmailLayout preview="You're unsubscribed">
      <Heading as="h2" style={{ margin: '0 0 8px', fontFamily: ARIA_EMAIL.display, fontSize: 22, fontWeight: 600, color: ARIA_EMAIL.forest }}>
        You&rsquo;re unsubscribed
      </Heading>
      <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: ARIA_EMAIL.muted, fontFamily: ARIA_EMAIL.body }}>
        You will no longer receive marketing emails. You may still receive transactional messages (receipts, bookings).
      </Text>
    </AriaEmailLayout>
  )
}
