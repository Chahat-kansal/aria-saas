'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface DeliveryAlert {
  type: 'delivery' | 'cutoff' | 'urgent'
  label: string
  detail?: string
  urgency?: 'normal' | 'high'
}

interface Props { businessId: string }

export default function DeliveryAlertWidget({ businessId }: Props) {
  const [alerts, setAlerts] = useState<DeliveryAlert[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!businessId) return
    fetch('/api/warehouse/delivery-schedule?business_id=' + businessId)
      .then(r => r.json())
      .then(data => {
        const today = data.week?.find((d: any) => d.is_today)
        const newAlerts: DeliveryAlert[] = []
        if (today?.deliveries?.length) {
          for (const d of today.deliveries) {
            newAlerts.push({ type: 'delivery', label: (d.short_code ?? d.name) + ' delivers today', urgency: 'normal' })
          }
        }
        if (today?.cutoffs?.length) {
          for (const c of today.cutoffs) {
            newAlerts.push({ type: 'cutoff', label: 'Order by today: ' + (c.short_code ?? c.name) + (c.delivers_on ? ' (' + c.delivers_on + ' delivery)' : ''), urgency: 'high' })
          }
        }
        for (const u of (data.urgent ?? []).slice(0, 3)) {
          newAlerts.push({ type: 'urgent', label: u.product_name + ' — ' + u.stock_days + 'd stock left', detail: 'Order by ' + u.must_order_by + ' · ' + u.name, urgency: 'high' })
        }
        setAlerts(newAlerts)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [businessId])

  if (!loaded || alerts.length === 0) return null

  const iconFor = (type: string) => type === 'delivery' ? '🚚' : type === 'cutoff' ? '✂' : '⚠'
  const colorFor = (a: DeliveryAlert) => a.type === 'urgent' || a.urgency === 'high' ? '#ef4444' : a.type === 'delivery' ? '#3b82f6' : '#f59e0b'
  const bgFor = (a: DeliveryAlert) => a.type === 'urgent' ? 'rgba(239,68,68,0.08)' : a.type === 'delivery' ? 'rgba(59,130,246,0.08)' : 'rgba(245,158,11,0.08)'
  const borderFor = (a: DeliveryAlert) => a.type === 'urgent' ? 'rgba(239,68,68,0.2)' : a.type === 'delivery' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)'

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {alerts.map((a, i) => (
        <Link key={i} href="/dashboard/warehouse/suppliers" className="no-underline">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer hover:opacity-80"
            style={{ background: bgFor(a), border: '1px solid ' + borderFor(a), color: colorFor(a), maxWidth: 320 }}>
            <span>{iconFor(a.type)}</span>
            <div>
              <p className="font-medium m-0 leading-tight">{a.label}</p>
              {a.detail && <p className="m-0 mt-0.5 leading-tight" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{a.detail}</p>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
