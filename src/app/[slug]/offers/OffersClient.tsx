'use client'

import { useState } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#fafafa'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const CARD_BG = '#fff'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

type Offer = {
  id: string
  title: string
  description: string | null
  image_url: string | null
  offer_type: string | null
  point_cost: number | null
  starts_at: string | null
  ends_at: string | null
}

function formatExpiry(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.ceil(diff / 86400000)
  if (days < 0) return 'Expired'
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  if (days <= 7) return 'Expires in ' + days + ' days'
  return 'Expires ' + d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function OfferTypeLabel({ type }: { type: string | null }) {
  if (!type) return null
  const labels: Record<string, string> = {
    discount: 'Discount', redeem: 'Redeem with points', stamp: 'Stamp reward', event: 'Event', gift: 'Gift'
  }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
      fontFamily: FB, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.05em', background: 'rgba(0,0,0,0.06)', color: INK_MUTED,
      marginBottom: 8,
    }}>
      {labels[type] ?? type}
    </span>
  )
}

export function OffersClient({ slug, bizName, offers }: {
  slug: string
  bizName: string
  offers: Offer[]
}) {
  const [read, setRead] = useState<Set<string>>(new Set())

  const markRead = (id: string) => setRead(s => new Set([...s, id]))

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      <div style={{ padding: '52px 20px 20px' }}>
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 30, margin: '0 0 4px' }}>
          Offers
        </h1>
        <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
          {'From ' + bizName}
        </p>
      </div>

      <div style={{ padding: '0 16px' }}>
        {offers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED }}>No active offers right now.</p>
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED }}>Check back soon.</p>
          </div>
        ) : (
          offers.map(offer => {
            const isRead = read.has(offer.id)
            const expiry = formatExpiry(offer.ends_at)
            return (
              <div
                key={offer.id}
                onClick={() => markRead(offer.id)}
                style={{
                  background: CARD_BG, borderRadius: 20, marginBottom: 14,
                  overflow: 'hidden', boxShadow: '0 2px 14px rgba(0,0,0,0.06)',
                  opacity: isRead ? 0.75 : 1,
                  cursor: 'default',
                }}
              >
                {/* Image */}
                {offer.image_url && (
                  <div style={{
                    height: 160,
                    background: 'url(' + offer.image_url + ') center/cover no-repeat #f0ede8',
                    position: 'relative',
                  }}>
                    {!isRead && (
                      <div style={{
                        position: 'absolute', top: 12, right: 12,
                        width: 10, height: 10, borderRadius: '50%',
                        background: ACCENT, boxShadow: '0 0 8px rgba(217,245,78,0.8)',
                      }} />
                    )}
                  </div>
                )}

                <div style={{ padding: '16px 18px' }}>
                  {!offer.image_url && !isRead && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <OfferTypeLabel type={offer.offer_type} />
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: ACCENT, boxShadow: '0 0 6px rgba(217,245,78,0.8)', flexShrink: 0, marginTop: 4,
                      }} />
                    </div>
                  )}
                  {offer.image_url && <OfferTypeLabel type={offer.offer_type} />}

                  <h3 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: INK, margin: '0 0 6px', lineHeight: 1.2 }}>
                    {offer.title}
                  </h3>
                  {offer.description && (
                    <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>
                      {offer.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {offer.point_cost !== null && offer.point_cost > 0 && (
                        <span style={{ background: ACCENT + '33', color: ACCENT_TEXT, fontFamily: FB, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999 }}>
                          {offer.point_cost + ' pts'}
                        </span>
                      )}
                      {expiry && (
                        <span style={{ background: 'rgba(0,0,0,0.05)', color: INK_MUTED, fontFamily: FB, fontSize: 12, padding: '4px 10px', borderRadius: 999 }}>
                          {expiry}
                        </span>
                      )}
                    </div>
                    <a
                      href={'/' + slug + '/menu'}
                      style={{ background: ACCENT, color: ACCENT_TEXT, padding: '8px 16px', borderRadius: 10, fontFamily: FB, fontSize: 13, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}
                    >
                      Redeem
                    </a>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <CxTabBar slug={slug} active="offers" />
    </div>
  )
}