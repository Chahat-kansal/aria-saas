import * as React from 'react'
import { Heading, Text, Button } from '@react-email/components'
import { AriaEmailLayout, ARIA_EMAIL } from './AriaEmailLayout'

// B28-REACT-EMAIL — staff portal one-click login link (transactional). Content + link + subject
// unchanged from the previous inline-HTML version; only the markup is now React Email.
export function StaffLoginLinkEmail({ firstName, actionLink }: { firstName: string; actionLink: string }) {
  return (
    <AriaEmailLayout preview="Your one-click login link for the AriaOS Staff Portal">
      <Heading as="h2" style={{ margin: '0 0 8px', fontFamily: ARIA_EMAIL.display, fontSize: 22, fontWeight: 600, color: ARIA_EMAIL.forest }}>
        Hi {firstName},
      </Heading>
      <Text style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.55, color: ARIA_EMAIL.muted, fontFamily: ARIA_EMAIL.body }}>
        Your manager has sent you a one-click login link for the AriaOS staff portal. Click below to sign in.
      </Text>
      <Button href={actionLink} style={{ display: 'inline-block', backgroundColor: ARIA_EMAIL.forest, color: ARIA_EMAIL.sage, padding: '14px 28px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 15, fontFamily: ARIA_EMAIL.body }}>
        Sign in to Staff Portal
      </Button>
      <Text style={{ margin: '24px 0 0', fontSize: 12, color: ARIA_EMAIL.faint, fontFamily: ARIA_EMAIL.body }}>
        This link expires in 1 hour. If you didn&apos;t expect this, you can ignore it.
      </Text>
    </AriaEmailLayout>
  )
}
