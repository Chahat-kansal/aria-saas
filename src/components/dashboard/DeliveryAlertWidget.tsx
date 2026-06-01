'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'

interface Suggestion {
  id: string
  product_name: string
  suggested_qty: number
  current_qty: number
  reason: string
  trend: string | null
  velocity_per_week: number | null
  stock_days_remaining: number | null
  price_change_pct: number | null
  accepted: boolean | null
  created_at: string
  supplier_id: string | null
}

const TREND_ICON: Record<string, string> = { rising: '↑', falling: '↓', stable: '→' }
const TREND_COLOR: Record<string, string> = {
  rising: 'text-emerald-400',
  falling: 'text-red-400',
  stable: 'text-[rgba(255,255,255,0.4)]',
}

export default function DeliveryAlertWidget({ businessId }: { businessId: string }) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    async function load() {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('supplier_ai_suggestions')
        .select('*')
        .eq('business_id', businessId)
        .is('accepted', null)
        .gte('created_at', since)
        .order('stock_days_remaining', { ascending: true })
        .limit(8)
      setItems((data ?? []) as Suggestion[])
      setLoading(false)
    }
    load()
  }, [businessId, supabase])

  async function accept(id: string) {
    await supabase.from('supplier_ai_suggestions').update({ accepted: true }).eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function dismiss(id: string) {
    await supabase.from('supplier_ai_suggestions').update({ accepted: false }).eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) return (
    <div className="animate-pulse space-y-2">
      {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-[rgba(255,255,255,0.04)]" />)}
    </div>
  )

  if (items.length === 0) return (
    <div className="text-center py-6 text-[rgba(255,255,255,0.3)] text-xs">
      No pending reorder suggestions — run the forecast to generate new ones
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {items.map(item => {
        const urgent = (item.stock_days_remaining ?? 99) <= 3
        const warning = (item.stock_days_remaining ?? 99) <= 7 && !urgent
        const borderColor = urgent ? 'border-red-500/30' : warning ? 'border-amber-400/25' : 'border-[rgba(127,184,151,0.15)]'
        const bgColor = urgent ? 'bg-red-500/[0.06]' : warning ? 'bg-amber-400/[0.05]' : 'bg-[rgba(255,255,255,0.03)]'
        const daysColor = urgent ? 'text-red-400' : warning ? 'text-amber-400' : 'text-[rgba(255,255,255,0.5)]'
        const trend = item.trend ?? 'stable'

        return (
          <div key={item.id} className={`rounded-xl border ${borderColor} ${bgColor} px-3 py-2.5 flex items-center gap-3`}>
            {/* urgency dot */}
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${urgent ? 'bg-red-400' : warning ? 'bg-amber-400' : 'bg-emerald-500/50'}`} />

            {/* product info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-[rgba(255,255,255,0.88)] truncate">{item.product_name}</span>
                {item.trend && (
                  <span className={`text-[10px] font-semibold ${TREND_COLOR[trend] ?? 'text-[rgba(255,255,255,0.4)]'}`}>
                    {TREND_ICON[trend] ?? '→'} {trend}
                  </span>
                )}
                {item.price_change_pct && Math.abs(item.price_change_pct) >= 2 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${item.price_change_pct > 0 ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    {item.price_change_pct > 0 ? '+' : ''}{item.price_change_pct.toFixed(0)}% cost
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-[rgba(255,255,255,0.35)]">
                  {item.current_qty} on hand · order {item.suggested_qty}
                </span>
                {item.stock_days_remaining != null && (
                  <span className={`text-[10px] font-medium ${daysColor}`}>
                    {item.stock_days_remaining <= 0 ? 'out now' : `${Math.round(item.stock_days_remaining)}d left`}
                  </span>
                )}
                {item.velocity_per_week != null && (
                  <span className="text-[10px] text-[rgba(255,255,255,0.25)]">
                    {item.velocity_per_week.toFixed(1)}/wk
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[rgba(255,255,255,0.28)] mt-0.5 leading-snug truncate">{item.reason}</p>
            </div>

            {/* actions */}
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => accept(item.id)}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-[#7FB897] text-[#0E1411] hover:bg-[#90c9a3] transition-colors"
              >
                Order ↗
              </button>
              <button
                onClick={() => dismiss(item.id)}
                className="text-[10px] font-medium px-2 py-1 rounded-lg border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.6)] transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        )
      })}

      <Link href="/dashboard/reorder" className="text-[10px] text-[rgba(127,184,151,0.6)] hover:text-[#7FB897] text-center mt-1 transition-colors">
        View full reorder forecast →
      </Link>
    </div>
  )
}
