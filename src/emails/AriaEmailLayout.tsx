import * as React from 'react'
import { Html, Head, Preview, Body, Container, Section, Hr, Text } from '@react-email/components'

// B28-REACT-EMAIL — shared Aria-branded email shell. Theme tokens mirror the dashboard
// (sage #7FB897, deep forest #2D5240, tan #C9A37A) with Cormorant (display) + Outfit (body).
// Web fonts are intentionally NOT @font-face'd (most email clients ignore them) — the family
// declarations degrade gracefully to Georgia / Helvetica.
export const ARIA_EMAIL = {
  sage: '#7FB897',
  forest: '#2D5240',
  tan: '#C9A37A',
  ink: '#1A1D23',
  muted: '#4A5568',
  faint: '#9ca3af',
  bg: '#f4f3ef',
  surface: '#ffffff',
  border: '#e8e6df',
  display: "'Cormorant Garamond', Cormorant, Georgia, 'Times New Roman', serif",
  body: "'Outfit', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
} as const

export function AriaEmailLayout({ preview, children }: { preview?: string; children: React.ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={{ backgroundColor: ARIA_EMAIL.bg, fontFamily: ARIA_EMAIL.body, margin: 0, padding: '24px 0' }}>
        <Container style={{ maxWidth: 520, margin: '0 auto', backgroundColor: ARIA_EMAIL.surface, borderRadius: 14, overflow: 'hidden', border: `1px solid ${ARIA_EMAIL.border}` }}>
          <Section style={{ backgroundColor: ARIA_EMAIL.forest, padding: '20px 28px' }}>
            <Text style={{ margin: 0, fontFamily: ARIA_EMAIL.display, fontSize: 26, fontWeight: 600, color: ARIA_EMAIL.sage, letterSpacing: '0.01em', lineHeight: 1 }}>Aria</Text>
          </Section>
          <Section style={{ padding: '28px' }}>{children}</Section>
          <Hr style={{ borderColor: ARIA_EMAIL.border, borderTop: `1px solid ${ARIA_EMAIL.border}`, margin: 0 }} />
          <Section style={{ padding: '16px 28px' }}>
            <Text style={{ margin: 0, fontSize: 11, color: ARIA_EMAIL.faint, lineHeight: 1.5, fontFamily: ARIA_EMAIL.body }}>Aria OS · ariaos.site</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
