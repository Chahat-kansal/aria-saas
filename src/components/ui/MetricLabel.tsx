'use client'
import { ReactNode } from 'react'

export function MetricLabel({ children }: { children: ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.16em', color: 'var(--text-tertiary)',
      margin: 0,
    }}>{children}</p>
  )
}
