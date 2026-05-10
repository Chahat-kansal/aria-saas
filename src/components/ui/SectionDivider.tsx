'use client'

export function SectionDivider() {
  return (
    <div style={{
      height: 1,
      background: 'linear-gradient(90deg, transparent, var(--divider), transparent)',
      opacity: 0.6, margin: '8px 0',
    }} />
  )
}
