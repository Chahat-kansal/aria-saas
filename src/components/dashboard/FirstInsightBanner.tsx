'use client'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

/**
 * FirstInsightBanner — shown to new users after they have at least 1 product.
 * Generates a real first insight from their data immediately.
 * Dismissed permanently once seen. Never shown again after dismiss.
 * UPGRADE_ONLY: add more insight types, never remove existing ones.
 */
export function FirstInsightBanner() {
  const { business } = useBusinessContext()
  const [insight, setInsight] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(true) // start hidden
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!business?.id) return
    const key = `aria_first_insight_seen_${business.id}`
    if (localStorage.getItem(key)) return // already seen
    setDismissed(false)
    setLoading(true)
    fetch(`/api/aria/first-insight?businessId=${business.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.insight) setInsight(d.insight)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [business?.id])

  const dismiss = () => {
    if (business?.id) localStorage.setItem(`aria_first_insight_seen_${business.id}`, '1')
    setDismissed(true)
  }

  if (dismissed || (!loading && !insight)) return null

  return (
    <div style={{
      width: '100%',
      background: 'linear-gradient(135deg, rgba(45,82,64,0.6) 0%, rgba(10,20,14,0.9) 100%)',
      border: '1px solid rgba(127,184,151,0.35)',
      borderRadius: 14,
      padding: '16px 20px',
      marginBottom: 20,
      position: 'relative',
    }}>
      <button onClick={dismiss} style={{
        position: 'absolute', top: 10, right: 12,
        background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
        fontSize: 18, cursor: 'pointer', lineHeight: 1,
      }}>×</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg,#2d5240,#0f3d26)',
          border: '1.5px solid rgba(127,184,151,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 16,
        }}>✦</div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7FB897', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Aria's first look at your business
          </div>
          {loading ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Analysing your data…</div>
          ) : (
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.82)', lineHeight: 1.6 }}>{insight}</div>
          )}
        </div>
      </div>
    </div>
  )
}
