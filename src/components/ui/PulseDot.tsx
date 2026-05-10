'use client'

export function PulseDot({ color = 'var(--success)' }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6,
      borderRadius: '50%', background: color,
      animation: 'pulse-dot 2.4s ease-in-out infinite',
    }} />
  )
}
