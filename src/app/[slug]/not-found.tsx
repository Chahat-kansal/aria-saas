'use client'
import { useParams } from 'next/navigation'
import { CxTabBar } from './CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

export default function CxNotFound() {
  const params = useParams<{ slug?: string }>()
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  const menuHref = slug ? ('/' + slug + '/menu') : '/'

  return (
    <div style={{
      minHeight: '100dvh', background: BG, fontFamily: FB, color: INK,
      maxWidth: '28rem', margin: '0 auto',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '0 28px',
    }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* Large faded 404 */}
      <p style={{
        fontFamily: FD, fontStyle: 'italic', fontSize: 96,
        color: INK, opacity: 0.10,
        margin: '0 0 4px', lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>
        404
      </p>

      <h1 style={{
        fontFamily: FD, fontStyle: 'italic', fontSize: 32, fontWeight: 500,
        color: INK, margin: '0 0 10px', lineHeight: 1.15,
      }}>
        Page not found
      </h1>

      <p style={{
        fontFamily: FB, fontSize: 15, color: INK_MUTED,
        margin: '0 0 36px', lineHeight: 1.5, maxWidth: 260,
      }}>
        This item or page doesn't exist or may have been removed.
      </p>

      <a
        href={menuHref}
        style={{
          display: 'inline-block',
          background: ACCENT, color: ACCENT_TEXT,
          borderRadius: 100, padding: '14px 32px',
          fontFamily: FB, fontSize: 15, fontWeight: 700,
          textDecoration: 'none',
          boxShadow: '0 0 24px rgba(217,245,78,0.40)',
        }}
      >
        ← Back to menu
      </a>

      {slug && (
        <CxTabBar slug={slug} active="menu" />
      )}
    </div>
  )
}