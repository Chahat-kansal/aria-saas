'use client'
import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { C, RADIUS, FONT } from './theme'
import { StoryViewer } from './StoryViewer'

export interface StoryItem {
  id: string
  body: string | null
  media_urls: string[]
  media_type: string | null
  published_at: string
  expires_at: string
}

export interface StoryBubble {
  business_id: string
  business: { name: string | null; logo_url: string | null; community_verified: boolean | null } | null
  story_count: number
  latest_at: string
  stories: StoryItem[]
}

export function StoriesRow({ bubbles, loading }: { bubbles: StoryBubble[]; loading?: boolean }) {
  const [active, setActive] = useState<number | null>(null)

  return (
    <>
      <div className="community-hide-scroll" style={{
        display: 'flex', gap: 14, overflowX: 'auto',
        padding: '4px 4px 12px', margin: '0 -4px',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        fontFamily: FONT,
      }}>
        {loading && bubbles.length === 0 ? (
          [0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ flexShrink: 0, width: 72, scrollSnapAlign: 'start' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.surfaceHi, margin: '0 auto 6px' }} />
              <div style={{ height: 8, background: C.surfaceHi, borderRadius: 4, margin: '0 8px' }} />
            </div>
          ))
        ) : bubbles.length === 0 ? (
          <p style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic', padding: '8px 0' }}>
            No active stories — local shops will post 24h offers here.
          </p>
        ) : bubbles.map((b, i) => (
          <button key={b.business_id}
            onClick={() => setActive(i)}
            style={{
              flexShrink: 0, width: 72, padding: 0, border: 'none',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              scrollSnapAlign: 'start',
            }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              padding: 2,
              background: `conic-gradient(${C.accent}, ${C.warning}, ${C.accent})`,
              margin: '0 auto 6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                background: b.business?.logo_url ? `url(${b.business.logo_url}) center/cover` : C.accentDeep,
                color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 18, border: `2px solid ${C.bg}`,
              }}>
                {!b.business?.logo_url && (b.business?.name?.[0] ?? '?')}
              </div>
            </div>
            <p style={{
              fontSize: 11, color: C.text, margin: 0, textAlign: 'center',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.business?.name ?? 'shop'}</span>
              {b.business?.community_verified && <BadgeCheck size={10} style={{ color: C.accent, flexShrink: 0 }} />}
            </p>
          </button>
        ))}
      </div>
      {active !== null && (
        <StoryViewer
          bubbles={bubbles}
          startIndex={active}
          onClose={() => setActive(null)}
        />
      )}
    </>
  )
}
