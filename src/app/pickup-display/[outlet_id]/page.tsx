'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const getDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Order { id: string; order_number: string; customer_name: string; status: string; updated_at: string }

export default function PickupDisplayPage() {
  const { outlet_id } = useParams<{ outlet_id: string }>()
  const [preparing, setPreparing] = useState<Order[]>([])
  const [ready,     setReady]     = useState<Order[]>([])
  const [bizName,   setBizName]   = useState('Cafe')
  const [tick,      setTick]      = useState(0)

  async function fetchOrders() {
    const db = getDb()
    // Get outlet → business name
    const { data: outlet } = await db.from('pos_outlets').select('business_id').eq('id', outlet_id).maybeSingle()
    if (outlet?.business_id) {
      const { data: biz } = await db.from('businesses').select('name').eq('id', outlet.business_id).maybeSingle()
      if (biz?.name) setBizName(biz.name)
    }

    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString() // hide collected >5min ago
    const { data: orders } = await db
      .from('pos_online_orders')
      .select('id, order_number, customer_name, status, updated_at')
      .eq('outlet_id', outlet_id)
      .in('status', ['confirmed', 'preparing', 'ready', 'collected'])
      .or(`status.neq.collected,updated_at.gte.${cutoff}`)
      .order('updated_at', { ascending: true })
      .limit(30)

    setPreparing((orders ?? []).filter(o => ['confirmed','preparing'].includes(o.status)))
    setReady((orders ?? []).filter(o => o.status === 'ready'))
  }

  useEffect(() => {
    fetchOrders()
    const t = setInterval(fetchOrders, 5000)
    const tickT = setInterval(() => setTick(n => n + 1), 1000)
    return () => { clearInterval(t); clearInterval(tickT) }
  }, [outlet_id])

  const now = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: '#0f1a26', fontFamily: "'Manrope',system-ui,sans-serif", padding: 0, userSelect: 'none' }}>
      {/* Header */}
      <div style={{ background: '#162030', padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid rgba(127,184,151,0.2)' }}>
        <span style={{ fontSize: 28, fontWeight: 900, color: '#7FB897' }}>{bizName}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>{now}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: 'calc(100vh - 74px)' }}>
        {/* Preparing column */}
        <div style={{ padding: 24, borderRight: '2px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#F59E0B', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#F59E0B', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            Preparing
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {preparing.length === 0
              ? <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, textAlign: 'center', marginTop: 48 }}>All done!</p>
              : preparing.map(o => (
                <div key={o.id} style={{ background: 'rgba(245,158,11,0.08)', border: '2px solid rgba(245,158,11,0.3)', borderRadius: 16, padding: '18px 24px' }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#F59E0B', letterSpacing: '-0.02em' }}>{o.order_number}</div>
                  <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{o.customer_name}</div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Ready column */}
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#7FB897', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#7FB897', display: 'inline-block' }} />
            Ready for collection
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ready.length === 0
              ? <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, textAlign: 'center', marginTop: 48 }}>—</p>
              : ready.map(o => (
                <div key={o.id} style={{ background: 'rgba(127,184,151,0.1)', border: '2px solid rgba(127,184,151,0.4)', borderRadius: 16, padding: '18px 24px', boxShadow: '0 0 24px rgba(127,184,151,0.15)' }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#7FB897', letterSpacing: '-0.02em' }}>{o.order_number}</div>
                  <div style={{ fontSize: 18, color: '#e8f4f8', marginTop: 4, fontWeight: 700 }}>{o.customer_name} ✓</div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}