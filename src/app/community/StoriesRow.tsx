'use client'
import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { PALETTE, RADIUS, FONT } from './theme'
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

const isLive = (latest: string) => Date.now() - new Date(latest).getTime() < 60 * 60 * 1000

export function StoriesRow({ bubbles, loading }: { bubbles: StoryBubble[]; loading?: boolean }) {
  const [active, setActive] = useState<number | null>(null)

  return (
    <>
      <div className="community-hide-scroll" style={{
        display: 'flex', gap: 16, overflowX: 'auto',
        padding: '2px 2px 14px', margin: '0 -2px',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        fontFamily: FONT,
      }}>
        {loading && bubbles.length === 0 ? (
          [0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ flexShrink: 0, width: 64, scrollSnapAlign: 'start' }}>
              <div style={{ width: 54, height: 54, borderRadius: '50%', background: PALETTE.surfaceAlt, margin: '0 auto 6px' }} />
              <div style={{ height: 8, background: PALETTE.surfaceAlt, borderRadius: 4, margin: '0 6px' }} />
            </div>
          ))
        ) : bubbles.length === 0 ? (
          <p style={{ fontSize: 11, color: PALETTE.inkSoft, padding: '6px 2px', fontWeight: 500 }}>
            no stories yet — local shops post 24h offers here.
          </p>
        ) : bubbles.map((b, i) => {
          const live = isLive(b.latest_at)
          return (
            <button key={b.business_id}
              onClick={() => setActive(i)}
              style={{
                flexShrink: 0, width: 64, padding: 0, border: 'none',
                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                scrollSnapAlign: 'start',
              }}>
              {/* 54px circle, 2.5px lime ring, 2px white inner border */}
              <div style={{
                position: 'relative',
                width: 54, height: 54, borderRadius: '50%',
                background: PALETTE.accent,           // lime ring
                padding: 2.5,
                margin: '0 auto 6px',
              }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%',
                  border: `2px solid ${PALETTE.surface}`,  // white inner border
                  boxSizing: 'border-box',
                  background: b.business?.logo_url ? `url(${b.business.logo_url}) center/cover` : PALETTE.ink,
                  color: PALETTE.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 17,
                }}>
                  {!b.business?.logo_url && (b.business?.name?.[0]?.toLowerCase() ?? '?')}
                </div>
                {live && (
                  <span style={{
                    position: 'absolute', bottom: -2, right: -2,
                    background: PALETTE.live, color: PALETTE.surface,
                    fontSize: 7, fontWeight: 700, padding: '2px 5px', borderRadius: 5,
                    letterSpacing: '0.04em',
                    border: `1.5px solid ${PALETTE.surface}`,
                  }}>LIVE</span>
                )}
              </div>
              <p style={{
                fontSize: 11, color: PALETTE.ink, margin: 0, textAlign: 'center', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(b.business?.name ?? 'shop').toLowerCase()}</span>
                {b.business?.community_verified && <BadgeCheck size={10} style={{ color: PALETTE.ink, flexShrink: 0 }} />}
              </p>
            </button>
          )
        })}
      </div>
      {active !== null && (
        <StoryViewer bubbles={bubbles} startIndex={active} onClose={() => setActive(null)} />
      )}
    </>
  )
}
