'use client'
import { useRouter } from 'next/navigation'

interface AriaEmptyStateProps {
  icon?: string
  title: string
  description: string
  ctaLabel?: string
  ctaHref?: string
  secondary?: string
  compact?: boolean
}

/**
 * AriaEmptyState — consistent empty state component across all dashboard widgets.
 * Always explains what Aria will do when connected, with a clear CTA.
 * UPGRADE_ONLY: add props, never remove existing ones.
 */
export function AriaEmptyState({ icon, title, description, ctaLabel, ctaHref, secondary, compact }: AriaEmptyStateProps) {
  const router = useRouter()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: compact ? '20px 16px' : '36px 24px',
      textAlign: 'center', gap: compact ? 8 : 12,
    }}>
      {icon && <div style={{ fontSize: compact ? 24 : 32, marginBottom: 4 }}>{icon}</div>}
      <div style={{ fontSize: compact ? 13 : 15, fontWeight: 600, color: 'var(--text-primary, #fff)' }}>{title}</div>
      <div style={{ fontSize: compact ? 12 : 13, color: 'var(--text-secondary, rgba(255,255,255,0.5))', lineHeight: 1.6, maxWidth: 280 }}>{description}</div>
      {ctaLabel && ctaHref && (
        <button
          onClick={() => router.push(ctaHref)}
          style={{
            marginTop: 4, padding: compact ? '7px 16px' : '9px 20px',
            background: 'rgba(127,184,151,0.12)',
            border: '1px solid rgba(127,184,151,0.35)',
            borderRadius: 8, color: '#7FB897',
            fontSize: compact ? 12 : 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(127,184,151,0.22)' }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'rgba(127,184,151,0.12)' }}
        >
          {ctaLabel}
        </button>
      )}
      {secondary && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{secondary}</div>
      )}
    </div>
  )
}
