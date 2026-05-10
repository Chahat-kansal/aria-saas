'use client'

export function AriaMark({ size = 14 }: { size?: number }) {
  return (
    <span style={{
      fontFamily: 'var(--font-display), Georgia, serif',
      fontStyle: 'italic', fontWeight: 600,
      color: 'var(--violet)',
      fontSize: size, letterSpacing: '-0.01em',
    }}>Aria</span>
  )
}
