import * as React from 'react'
import { Heading, Text, Hr, Link, Row, Column } from '@react-email/components'
import { AriaEmailLayout, ARIA_EMAIL } from './AriaEmailLayout'

// B28-REACT-EMAIL — owner-facing notification for a new contact-form submission. Same fields,
// same mailto, same "sent via" footer line as the previous inline-HTML version.
export function ContactNotificationEmail({ name, email, message }: { name: string; email: string; message: string }) {
  const cell = { padding: '6px 0', fontSize: 14, fontFamily: ARIA_EMAIL.body, color: ARIA_EMAIL.ink } as const
  const labelCell = { ...cell, color: ARIA_EMAIL.muted, width: 80 } as const
  return (
    <AriaEmailLayout preview={`New contact form submission from ${name}`}>
      <Heading as="h2" style={{ margin: '0 0 16px', fontFamily: ARIA_EMAIL.display, fontSize: 22, fontWeight: 600, color: ARIA_EMAIL.forest }}>
        New contact form submission
      </Heading>
      <Row>
        <Column style={labelCell}><strong>Name</strong></Column>
        <Column style={cell}>{name}</Column>
      </Row>
      <Row>
        <Column style={labelCell}><strong>Email</strong></Column>
        <Column style={cell}><Link href={`mailto:${email}`} style={{ color: ARIA_EMAIL.forest }}>{email}</Link></Column>
      </Row>
      <Hr style={{ borderColor: ARIA_EMAIL.border, borderTop: `1px solid ${ARIA_EMAIL.border}`, margin: '16px 0' }} />
      <Text style={{ whiteSpace: 'pre-wrap', color: ARIA_EMAIL.ink, fontSize: 14, lineHeight: 1.55, margin: 0, fontFamily: ARIA_EMAIL.body }}>{message}</Text>
      <Hr style={{ borderColor: ARIA_EMAIL.border, borderTop: `1px solid ${ARIA_EMAIL.border}`, margin: '16px 0' }} />
      <Text style={{ fontSize: 12, color: ARIA_EMAIL.faint, margin: 0, fontFamily: ARIA_EMAIL.body }}>Sent via ariaos.site/contact</Text>
    </AriaEmailLayout>
  )
}
