'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PALETTE, BORDER, RADIUS } from './theme'
import { LevelChip } from './LevelChip'

// CX-CLARITY-1 — the comprehension anchor: one shared card rendered on every business-scoped
// community screen (café feed, profile, leaderboard) for linked members. GROUNDING-TEETH: every
// number here comes straight from the profile API's your_status (real ledger sum + real config
// thresholds — see lib/community/points.ts + levels.ts) — this component never computes or guesses.

export interface YourStatus {
  level: number; name: string; nextAt: number | null; progress: number; lifetimePoints: number
  unlockedPerkPoints: number | null; upcomingLevelName: string | null; upcomingPerkPoints: number | null
}

export function MemberStatusCard({ yourStatus, slug, businessName }: { yourStatus: YourStatus | null; slug: string; businessName: string }) {
  const [expanded, setExpanded] = useState(true)

  // Compact/sticky pill on scroll — plain scroll listener + CSS transition, no animation libs.
  useEffect(() => {
    if (!yourStatus) return
    const onScroll = () => setExpanded(window.scrollY < 120)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [yourStatus])

  // Unlinked visitor: the card slot becomes a join prompt, never an empty box.
  if (!yourStatus) {
    return (
      <Link href={`/loyalty/${slug}`} prefetch={false} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        marginTop: 14, padding: '12px 14px', textDecoration: 'none',
        background: PALETTE.accent, border: BORDER, borderRadius: RADIUS.lg,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: PALETTE.ink }}>⭐ Join {businessName}&rsquo;s rewards — earn points, level up</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: PALETTE.ink, flexShrink: 0 }}>join →</span>
      </Link>
    )
  }

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} style={{
        position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 40,
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', cursor: 'pointer',
        background: PALETTE.ink, color: PALETTE.surface, border: 'none', borderRadius: RADIUS.pill,
        fontSize: 11, fontWeight: 700, fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        transition: 'opacity 150ms',
      }}>
        L{yourStatus.level} · {yourStatus.lifetimePoints} pts
      </button>
    )
  }

  return (
    <Link href={`/community/${slug}/leaderboard`} prefetch={false} style={{
      display: 'block', marginTop: 14, padding: '12px 14px', textDecoration: 'none',
      background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.lg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LevelChip level={{ level: yourStatus.level, name: yourStatus.name }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: PALETTE.ink }}>{yourStatus.lifetimePoints} pts lifetime</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.ink }}>leaderboard →</span>
      </div>
      <div style={{ height: 5, background: PALETTE.surfaceAlt, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(yourStatus.progress * 100)}%`, background: PALETTE.accent }} />
      </div>
      <p style={{ fontSize: 10, color: PALETTE.inkSoft, margin: '6px 0 0' }}>
        {yourStatus.nextAt != null
          ? `${yourStatus.nextAt - yourStatus.lifetimePoints} pts to the next level`
          : 'Top level reached'}
      </p>
      {/* Real award only — never a fabricated "you unlocked X" before the ledger has actually paid it out. */}
      {yourStatus.unlockedPerkPoints != null && (
        <p style={{ fontSize: 10, fontWeight: 700, color: PALETTE.ink, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
          🎁 Level {yourStatus.level} unlocked — +{yourStatus.unlockedPerkPoints} bonus points
        </p>
      )}
      {/* Teaser is config-only (never implies it's earned) and only shown when a real perk_reward_rule_id
          exists for the next level — GROUNDING-TEETH: never invent a reward that isn't configured. */}
      {yourStatus.upcomingLevelName && yourStatus.upcomingPerkPoints != null && (
        <p style={{ fontSize: 10, color: PALETTE.inkSoft, margin: '4px 0 0' }}>
          Next: {yourStatus.upcomingLevelName} unlocks +{yourStatus.upcomingPerkPoints} bonus points
        </p>
      )}
    </Link>
  )
}
