'use client'
import { useState, useEffect, useRef } from 'react'

interface AdCampaign {
  id: string
  ad_title: string
  ad_body: string | null
  ad_image_url: string | null
  advertiser_name: string
}

interface Props {
  businessId: string | null | undefined
  rotateMs?: number
  variant?: 'display' | 'kiosk'
}

export function AdRotator({ businessId, rotateMs = 12000, variant = 'display' }: Props) {
  const [ads, setAds] = useState<AdCampaign[]>([])
  const [idx, setIdx] = useState(0)
  const loggedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!businessId) return
    fetch(`/api/pos/ad-impressions?business_id=${businessId}`)
      .then(r => r.ok ? r.json() : { campaigns: [] })
      .then(d => setAds(d.campaigns ?? []))
      .catch(() => setAds([]))
  }, [businessId])

  useEffect(() => {
    if (ads.length === 0) return
    const iv = setInterval(() => setIdx(i => (i + 1) % ads.length), rotateMs)
    return () => clearInterval(iv)
  }, [ads.length, rotateMs])

  useEffect(() => {
    if (!businessId || ads.length === 0) return
    const current = ads[idx]
    if (!current) return
    const key = `${current.id}:${Math.floor(Date.now() / 60000)}` // dedupe per-minute
    if (loggedRef.current.has(key)) return
    loggedRef.current.add(key)
    fetch('/api/pos/ad-impressions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: current.id, business_id: businessId }),
    }).catch(() => { /* non-fatal */ })
  }, [idx, ads, businessId])

  if (ads.length === 0) return null
  const ad = ads[idx]

  const isKiosk = variant === 'kiosk'

  return (
    <div style={{
      maxWidth: isKiosk ? 520 : 540,
      margin: '20px auto 0',
      padding: isKiosk ? '14px 18px' : '16px 20px',
      borderRadius: 14,
      background: isKiosk ? 'rgba(127,184,151,0.05)' : 'rgba(255,255,255,0.04)',
      border: '1px solid ' + (isKiosk ? 'rgba(127,184,151,0.18)' : 'rgba(255,255,255,0.06)'),
      display: 'flex', gap: 14, alignItems: 'center',
      animation: 'ad-fade 0.6s ease-out',
    }}>
      {ad.ad_image_url && (
        <img src={ad.ad_image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: isKiosk ? '#7FB897' : 'rgba(139,133,168,0.5)', margin: 0,
        }}>Featured · {ad.advertiser_name}</p>
        <p style={{
          fontSize: isKiosk ? 16 : 17, fontWeight: 600, margin: '4px 0 2px',
          color: isKiosk ? '#F0F4F0' : 'rgba(237,232,255,0.9)',
          fontFamily: isKiosk ? 'Fraunces, serif' : 'inherit',
          fontStyle: isKiosk ? 'italic' : 'normal',
        }}>{ad.ad_title}</p>
        {ad.ad_body && (
          <p style={{ fontSize: 12, color: isKiosk ? 'rgba(255,255,255,0.55)' : 'rgba(139,133,168,0.6)', margin: 0, lineHeight: 1.4 }}>
            {ad.ad_body}
          </p>
        )}
      </div>
      <style jsx>{`
        @keyframes ad-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
