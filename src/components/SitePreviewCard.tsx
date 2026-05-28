'use client'
import { useState } from 'react'
import type { SitePreviewResult } from '@/app/api/site-preview/route'

// Locked Pipel design system — light theme, ink-on-cream, hard 1.5px ink borders.
const INK = '#0a0a0a'
const CREAM = '#fafafa'
const SURFACE = '#ffffff'
const INK_SOFT = '#888888'
const ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = 'Inter, system-ui, -apple-system, sans-serif'

const clamp2: React.CSSProperties = {
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  overflow: 'hidden', textOverflow: 'ellipsis',
}

export function SitePreviewCard({ result, onConfirm, onReject, busy = false }: {
  result: SitePreviewResult
  onConfirm: () => void
  onReject: () => void
  busy?: boolean
}) {
  const [imgFailed, setImgFailed] = useState(false)

  const yesBtn: React.CSSProperties = {
    flex: 1, height: 44, borderRadius: 12, border: BORDER, background: ACCENT, color: INK,
    fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: FONT,
    opacity: busy ? 0.6 : 1,
  }
  const noBtn: React.CSSProperties = {
    flex: 1, height: 44, borderRadius: 12, border: BORDER, background: SURFACE, color: INK,
    fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: FONT,
    opacity: busy ? 0.6 : 1,
  }

  // ── Error / unreachable state ─────────────────────────────────────────────
  if (!result.ok) {
    return (
      <div style={{ background: SURFACE, border: BORDER, borderRadius: 18, padding: 18, fontFamily: FONT, maxWidth: 460 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 6 }}>Couldn&apos;t load a preview</div>
        <p style={{ fontSize: 13, color: INK_SOFT, margin: '0 0 16px', lineHeight: 1.5 }}>{result.message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onReject} disabled={busy} style={noBtn}>Edit address</button>
          <button onClick={onConfirm} disabled={busy} style={{ ...yesBtn, background: SURFACE }}>
            {busy ? 'Saving…' : 'Save anyway'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: INK_SOFT, margin: '12px 0 0', lineHeight: 1.45 }}>
          Some sites block automated previews. If you&apos;re sure this is your address, save it anyway.
        </p>
      </div>
    )
  }

  // ── Success state ─────────────────────────────────────────────────────────
  const showImage = result.ogImage && !imgFailed
  return (
    <div style={{ background: SURFACE, border: BORDER, borderRadius: 18, padding: 16, fontFamily: FONT, maxWidth: 460 }}>
      {/* favicon + domain */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, border: BORDER, background: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {result.favicon
            ? <img src={result.favicon} alt="" width={16} height={16} style={{ objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            : null}
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {result.domain}
        </span>
        {!result.isHttps && (
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: INK, background: '#ffd5dd', border: BORDER, borderRadius: 8, padding: '2px 7px' }}>NOT SECURE</span>
        )}
      </div>

      {/* og image / placeholder */}
      <div style={{ height: 150, borderRadius: 14, border: BORDER, overflow: 'hidden', marginBottom: 12, background: showImage ? CREAM : `linear-gradient(135deg, ${CREAM} 0%, ${ACCENT} 100%)` }}>
        {showImage && (
          <img src={result.ogImage!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={() => setImgFailed(true)} />
        )}
      </div>

      {/* title + description */}
      {result.title && <div style={{ fontSize: 16, fontWeight: 700, color: INK, lineHeight: 1.3, marginBottom: 4, ...clamp2 }}>{result.title}</div>}
      {result.description && <p style={{ fontSize: 13, color: INK_SOFT, lineHeight: 1.5, margin: '0 0 16px', ...clamp2 }}>{result.description}</p>}
      {!result.description && <div style={{ marginBottom: 16 }} />}

      {/* actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onConfirm} disabled={busy} style={yesBtn}>{busy ? 'Saving…' : "Yes, that's my site"}</button>
        <button onClick={onReject} disabled={busy} style={noBtn}>No, fix it</button>
      </div>
    </div>
  )
}
