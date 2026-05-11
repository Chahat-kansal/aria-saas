'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function LivePulseRail({ businessId }: { businessId: string | null }) {
  const [stats, setStats] = useState({
    today: 0,
    todayDelta: 0,
    perMin: 0,
    hot: '…',
    registerOpen: true,
  })

  useEffect(() => {
    if (!businessId || !supabase) return
    let alive = true

    async function fetchPulse() {
      if (!alive || !supabase) return

      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

      const [todayRes, yRes, recentRes, hotRes] = await Promise.allSettled([
        supabase!.from('pos_sales').select('total_amount').eq('business_id', businessId!).gte('created_at', `${today}T00:00:00`).neq('status', 'voided'),
        supabase!.from('pos_sales').select('total_amount').eq('business_id', businessId!).gte('created_at', `${yesterday}T00:00:00`).lt('created_at', `${yesterday}T${String(new Date().getHours()).padStart(2,'0')}:00:00`).neq('status', 'voided'),
        supabase!.from('pos_sales').select('total_amount').eq('business_id', businessId!).gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString()).neq('status', 'voided'),
        supabase!.from('pos_sale_items').select('product_name, quantity').eq('business_id', businessId!).gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString()).limit(500),
      ])

      const todaySales = todayRes.status === 'fulfilled' ? (todayRes.value.data ?? []) : []
      const ySales     = yRes.status === 'fulfilled'     ? (yRes.value.data ?? [])     : []
      const recent     = recentRes.status === 'fulfilled' ? (recentRes.value.data ?? []) : []
      const hotItems   = hotRes.status === 'fulfilled'   ? (hotRes.value.data ?? [])   : []

      const todayTotal = (todaySales as any[]).reduce((s: number, x: any) => s + (x.total_amount ?? 0), 0)
      const yTotal     = (ySales as any[]).reduce((s: number, x: any) => s + (x.total_amount ?? 0), 0)
      const delta      = yTotal > 0 ? ((todayTotal - yTotal) / yTotal) * 100 : 0
      const perMin     = (recent as any[]).reduce((s: number, x: any) => s + (x.total_amount ?? 0), 0) / 15

      // Hot product by quantity in last hour
      const tally = new Map<string, number>()
      for (const item of hotItems as Array<{ product_name: string; quantity: number }>) {
        tally.set(item.product_name, (tally.get(item.product_name) ?? 0) + (item.quantity ?? 1))
      }
      const hot = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

      if (alive) setStats({ today: todayTotal, todayDelta: delta, perMin, hot: hot.slice(0, 14), registerOpen: true })
    }

    fetchPulse()
    const interval = setInterval(fetchPulse, 30_000)
    return () => { alive = false; clearInterval(interval) }
  }, [businessId])

  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`

  return (
    <div className="aria-pulse-rail">
      <div className="aria-pulse-mark">
        <span className="aria-pulse-mark-dot" />
        <span className="aria-pulse-mark-label">Aria</span>
        <span style={{ color: 'var(--terminal-text-tertiary,#7A8B7E)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          live
        </span>
      </div>

      <div className="aria-heartbeat-wave">
        <svg viewBox="0 0 800 22" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path className="aria-wave-path" fill="none" stroke="var(--terminal-sage,#7FB897)" strokeWidth="1.5"
            d="M 0,11 L 40,11 L 50,11 L 60,3 L 70,19 L 80,7 L 90,11 L 200,11 L 210,11 L 220,5 L 230,17 L 240,11 L 360,11 L 370,11 L 380,8 L 390,14 L 400,11 L 520,11 L 530,11 L 540,4 L 550,18 L 560,8 L 570,14 L 580,11 L 700,11 L 710,11 L 720,7 L 730,15 L 740,11 L 800,11" />
        </svg>
      </div>

      <PulseStat label="Today" value={fmt(stats.today)}
        arrow={stats.todayDelta >= 0 ? `↑ ${stats.todayDelta.toFixed(0)}%` : `↓ ${Math.abs(stats.todayDelta).toFixed(0)}%`}
        arrowDir={stats.todayDelta >= 0 ? 'up' : 'down'} />
      <Divider />
      <PulseStat label="$/min" value={`$${stats.perMin.toFixed(2)}`} colour="amber" />
      <Divider />
      <PulseStat label="Hot" value={stats.hot} />
      <Divider />
      <PulseStat label="Reg" value={stats.registerOpen ? '● Open' : 'Closed'} colour={stats.registerOpen ? 'live' : undefined} />
    </div>
  )
}

function PulseStat({ label, value, arrow, arrowDir, colour }: {
  label: string; value: string;
  arrow?: string; arrowDir?: 'up' | 'down';
  colour?: 'amber' | 'live'
}) {
  return (
    <div className="aria-pulse-stat">
      <span className="aria-pulse-stat-label">{label}</span>
      <span className={`aria-pulse-stat-value${colour ? ' ' + colour : ''}`}>{value}</span>
      {arrow && <span className={`aria-pulse-stat-arrow${arrowDir === 'down' ? ' down' : ''}`}>{arrow}</span>}
    </div>
  )
}

function Divider() { return <span className="aria-pulse-divider" /> }
