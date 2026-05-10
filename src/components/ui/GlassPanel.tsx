'use client'
import { ReactNode, CSSProperties } from 'react'

export function GlassPanel({
  children, className, style, elevated = false,
}: { children: ReactNode; className?: string; style?: CSSProperties; elevated?: boolean }) {
  return (
    <div className={className} style={{
      background: elevated ? 'var(--bg-elevated)' : 'var(--bg-glass)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      boxShadow: elevated ? 'var(--shadow-md)' : 'var(--shadow-sm)',
      borderRadius: 14,
      ...style,
    }}>
      {children}
    </div>
  )
}
