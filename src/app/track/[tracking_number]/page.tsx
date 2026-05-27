'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Event { time: string; location: string; description: string }
interface ParcelData {
  parcel: {
    tracking_number: string
    carrier: string | null
    carrier_name: string | null
    status: string | null
    status_detail: string | null
    events: Event[]
    estimated_delivery: string | null
    delivered_at: string | null
    last_event_at: string | null
    created_at: string
    recipient_city: string | null
    recipient_state: string | null
  }
  business: { name: string | null; phone: string | null; city: string | null } | null
}

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Registered', color: '#9CA3AF', icon: '⏳' },
  in_transit: { label: 'In Transit', color: '#60A5FA', icon: '🚚' },
  out_for_delivery: { label: 'Out for Delivery', color: '#F59E0B', icon: '📦' },
  delivered: { label: 'Delivered', color: '#22C55E', icon: '✅' },
  exception: { label: 'Exception', color: '#EF4444', icon: '⚠️' },
  failed: { label: 'Failed', color: '#EF4444', icon: '✗' },
  returned: { label: 'Returned', color: '#F59E0B', icon: '↩️' },
}

export default function PublicTrackPage() {
  const params = useParams()
  const tn = (params?.tracking_number as string) ?? ''
  const [data, setData] = useState<ParcelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!tn) return
    fetch(`/api/track/${encodeURIComponent(tn)}`)
      .then(r => { if (r.status === 404) { setNotFound(true); return null } return r.json() })
      .then(d => { if (d) setData(d); setLoading(false) })
      .catch(() => { setLoading(false); setNotFound(true) })
  }, [tn])

  if (loading) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0E1812', color: '#E8EDE7', fontFamily: 'Manrope,sans-serif' }}><p>Loading…</p></main>
  if (notFound || !data) return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0E1812', color: '#E8EDE7', fontFamily: 'Manrope,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 32, marginBottom: 12 }}>📦</p>
        <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Tracking number not found</p>
        <p style={{ fontSize: 13, color: '#A8B5A8' }}>Check the number and try again.</p>
      </div>
    </main>
  )

  const { parcel, business } = data
  const meta = STATUS_META[parcel.status ?? 'pending'] ?? STATUS_META.pending

  return (
    <main style={{ minHeight: '100vh', background: '#0E1812', color: '#E8EDE7', fontFamily: 'Manrope,sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        {business && (
          <div style={{ marginBottom: 28, padding: '14px 18px', borderRadius: 12, background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Shipped by</p>
            <p style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{business.name ?? 'Your store'}</p>
            {business.city && <p style={{ fontSize: 12, color: '#A8B5A8' }}>{business.city}</p>}
          </div>
        )}

        {/* Status banner */}
        <div style={{ marginBottom: 24, padding: 20, borderRadius: 14, background: meta.color + '12', border: `1px solid ${meta.color}40`, textAlign: 'center' }}>
          <p style={{ fontSize: 40, marginBottom: 6 }}>{meta.icon}</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: meta.color, marginBottom: 4 }}>{meta.label}</p>
          {parcel.status_detail && <p style={{ fontSize: 13, color: '#A8B5A8' }}>{parcel.status_detail}</p>}
          {parcel.estimated_delivery && parcel.status !== 'delivered' && (
            <p style={{ fontSize: 12, color: '#A8B5A8', marginTop: 8 }}>Estimated delivery: <strong style={{ color: '#fff' }}>{new Date(parcel.estimated_delivery).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</strong></p>
          )}
          {parcel.delivered_at && (
            <p style={{ fontSize: 12, color: '#A8B5A8', marginTop: 8 }}>Delivered: <strong style={{ color: '#fff' }}>{new Date(parcel.delivered_at).toLocaleString('en-AU')}</strong></p>
          )}
        </div>

        {/* Meta */}
        <div style={{ marginBottom: 24, padding: '12px 18px', borderRadius: 10, background: '#1A2620', border: '1px solid rgba(232,237,231,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#A8B5A8' }}>Tracking</span>
            <span style={{ fontFamily: 'monospace', color: '#fff' }}>{parcel.tracking_number}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
            <span style={{ color: '#A8B5A8' }}>Carrier</span>
            <span style={{ color: '#fff' }}>{parcel.carrier_name ?? '—'}</span>
          </div>
        </div>

        {/* Timeline */}
        {parcel.events && parcel.events.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#A8B5A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Journey</p>
            <div style={{ borderLeft: '2px solid rgba(127,184,151,0.25)', paddingLeft: 18 }}>
              {parcel.events.map((e, i) => (
                <div key={i} style={{ position: 'relative', marginBottom: 18 }}>
                  <div style={{ position: 'absolute', left: -25, top: 4, width: 12, height: 12, borderRadius: '50%', background: i === 0 ? '#7FB897' : '#2D5240', border: '2px solid #0E1812' }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{e.description}</p>
                  {e.location && <p style={{ fontSize: 12, color: '#A8B5A8', marginTop: 2 }}>{e.location}</p>}
                  {e.time && <p style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{new Date(e.time).toLocaleString('en-AU')}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {business?.phone && (
          <div style={{ marginTop: 32, textAlign: 'center' }}>
            <a href={`tel:${business.phone}`}
              style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, background: '#2D5240', color: '#7FB897', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              📞 Contact {business.name}
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
