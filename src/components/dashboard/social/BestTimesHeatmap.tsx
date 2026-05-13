'use client'
import { useState, useEffect } from 'react'
import type { EngagementBucket } from '@/types/scheduler'

const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12am' : i < 12 ? `${i}am` : i === 12 ? '12pm' : `${i - 12}pm`
)

function sageAlpha(score: number): string {
  // 127,184,151 = #7FB897
  const a = Math.min(0.9, score / 100 * 0.9 + 0.05)
  return `rgba(127,184,151,${a.toFixed(2)})`
}

export function BestTimesHeatmap({
  businessId,
  onSelectSlot,
}: {
  businessId: string
  onSelectSlot?: (datetime: string) => void
}) {
  const [buckets, setBuckets]     = useState<EngagementBucket[]>([])
  const [loading, setLoading]     = useState(true)
  const [hasData, setHasData]     = useState(false)
  const [tooltip, setTooltip]     = useState<{ x: number; y: number; text: string } | null>(null)

  useEffect(() => {
    fetch(`/api/social/scheduler/analyze?business_id=${businessId}`)
      .then(r => r.json())
      .then(d => {
        setBuckets(d.buckets ?? [])
        setHasData(d.has_enough_data ?? false)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [businessId])

  // Build score map: [platform][dow][hour] = score
  const maxEngagement = buckets.reduce((m, b) => Math.max(m, b.avgEngagement), 1)

  const getScore = (dow: number, hour: number): { score: number; bucket?: EngagementBucket } => {
    const bucket = buckets.find(b => b.dayOfWeek === dow && b.hour === hour)
    if (!bucket) return { score: 0 }
    return { score: bucket.avgEngagement / maxEngagement * 100, bucket }
  }

  const handleCellClick = (dow: number, hour: number) => {
    if (!onSelectSlot) return
    const now = new Date()
    const target = new Date(now)
    // Find next occurrence of this day-of-week
    const daysUntil = (dow - now.getDay() + 7) % 7 || 7
    target.setDate(now.getDate() + daysUntil)
    target.setHours(hour, 0, 0, 0)
    onSelectSlot(target.toISOString())
  }

  if (loading) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 24, textAlign: 'center' }}>
        Loading engagement data…
      </div>
    )
  }

  if (!hasData) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: '0 0 6px' }}>
          Post more to unlock your personal best times.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, margin: 0 }}>
          Using industry defaults for now. Come back after 10+ published posts.
        </p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '0 0 12px' }}>
        Engagement heatmap — darker = higher average engagement. Click any cell to schedule.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 2, minWidth: 600 }}>
          <thead>
            <tr>
              <td style={{ width: 32 }} />
              {HOURS.filter((_, i) => i % 2 === 0).map((h, idx) => (
                <th key={h} colSpan={2}
                  style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 400, textAlign: 'center', paddingBottom: 4, width: 20 }}>
                  {idx % 3 === 0 ? h : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, dow) => (
              <tr key={day}>
                <td style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', paddingRight: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {day}
                </td>
                {Array.from({ length: 24 }, (_, hour) => {
                  const { score, bucket } = getScore(dow, hour)
                  return (
                    <td key={hour}
                      style={{ width: 14, height: 14, borderRadius: 2, cursor: onSelectSlot ? 'pointer' : 'default', background: score > 0 ? sageAlpha(score) : 'rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setTooltip({
                          x: rect.left,
                          y: rect.top,
                          text: bucket
                            ? `${day} ${HOURS[hour]} — ${bucket.sampleSize} posts, avg ${bucket.avgEngagement} eng`
                            : `${day} ${HOURS[hour]} — no data`,
                        })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => handleCellClick(dow, hour)}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y - 32,
          background: '#1a2e20', border: '1px solid rgba(127,184,151,0.3)',
          borderRadius: 6, padding: '4px 10px', fontSize: 11,
          color: 'rgba(255,255,255,0.8)', pointerEvents: 'none', zIndex: 9999,
          whiteSpace: 'nowrap',
        }}>
          {tooltip.text}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Low</span>
        {[10, 30, 50, 70, 90].map(s => (
          <div key={s} style={{ width: 14, height: 14, borderRadius: 2, background: sageAlpha(s) }} />
        ))}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>High</span>
      </div>
    </div>
  )
}