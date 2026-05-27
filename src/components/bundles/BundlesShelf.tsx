'use client'
import { useState, useEffect } from 'react'

interface Bundle {
  id: string
  bundle_name: string
  bundle_pitch: string | null
  bundle_price: number
  individual_total: number
  product_ids: string[]
}

interface Props {
  businessId: string | null | undefined
  variant?: 'kiosk' | 'pos'
}

export function BundlesShelf({ businessId, variant = 'kiosk' }: Props) {
  const [bundles, setBundles] = useState<Bundle[]>([])

  useEffect(() => {
    if (!businessId) return
    fetch(`/api/aria/bundle-builder?business_id=${businessId}`)
      .then(r => r.ok ? r.json() : { bundles: [] })
      .then(d => setBundles((d.bundles ?? []).slice(0, 4)))
      .catch(() => setBundles([]))
  }, [businessId])

  if (bundles.length === 0) return null

  const isPos = variant === 'pos'

  return (
    <div style={{ maxWidth: isPos ? '100%' : 540, margin: '24px auto 0' }}>
      <p style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#7FB897', margin: '0 0 10px', textAlign: isPos ? 'left' : 'center',
      }}>
        Today&apos;s bundles
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: isPos ? 'repeat(auto-fit, minmax(160px, 1fr))' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {bundles.map(b => {
          const saving = Number(b.individual_total) - Number(b.bundle_price)
          const pct = Number(b.individual_total) > 0 ? (saving / Number(b.individual_total)) * 100 : 0
          return (
            <div key={b.id} style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(127,184,151,0.06)',
              border: '1px solid rgba(127,184,151,0.22)',
            }}>
              <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#F0F4F0', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{b.bundle_name}</p>
              {b.bundle_pitch && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: '4px 0 6px', lineHeight: 1.4 }}>{b.bundle_pitch}</p>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#7FB897' }}>A${Number(b.bundle_price).toFixed(2)}</span>
                <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>{pct.toFixed(0)}% OFF</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
