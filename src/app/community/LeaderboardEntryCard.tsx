'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PALETTE, BORDER, RADIUS } from './theme'

// CX-CLARITY-1 — makes the leaderboard findable from the café feed instead of being an unfindable
// sub-route. Reads the SAME persisted 7d snapshot the leaderboard page reads (no new endpoint, no
// live recompute here) — real data only; an empty/missing snapshot shows an honest placeholder,
// never fake rows.

interface Row { display_name: string; level: number; rank: number }

export function LeaderboardEntryCard({ slug }: { slug: string }) {
  const [top3, setTop3] = useState<Row[] | null>(null)

  useEffect(() => {
    fetch(`/api/community/businesses/${slug}/leaderboard?period=7d`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTop3((d?.top ?? []).slice(0, 3)))
      .catch(() => setTop3([]))
  }, [slug])

  if (top3 === null) return null // loading — no flash of an empty state

  return (
    <Link href={`/community/${slug}/leaderboard`} prefetch={false} style={{
      display: 'block', marginTop: 10, padding: '12px 14px', textDecoration: 'none',
      background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.lg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: top3.length ? 8 : 0 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: PALETTE.ink, margin: 0 }}>🏆 This week&rsquo;s top locals</p>
        <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.ink }}>view all →</span>
      </div>
      {top3.length === 0 ? (
        <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: 0 }}>Leaderboard updates daily.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {top3.map(r => (
            <p key={r.rank} style={{ fontSize: 11, color: PALETTE.ink, margin: 0, display: 'flex', gap: 6 }}>
              <span style={{ fontWeight: 700, width: 14 }}>{r.rank}</span>
              <span style={{ flex: 1 }}>{r.display_name}</span>
              <span style={{ color: PALETTE.inkSoft }}>L{r.level}</span>
            </p>
          ))}
        </div>
      )}
    </Link>
  )
}
