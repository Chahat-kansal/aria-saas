'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { calcRFM, TIER_COLOR } from '@/lib/rfm'

type Customer = Record<string, unknown>
type Sale = { id: string; created_at: string; total_amount: number; payment_method: string | null; pos_sale_items?: Array<{ product_name: string; quantity: number; line_total: number }> }
type RfmData = { r: number; f: number; m: number; total: number; tier: 'bronze' | 'silver' | 'gold'; daysSince: number }

function coalesce(...vals: (number | string | null | undefined)[]) {
  for (const v of vals) if (v != null) return Number(v)
  return 0
}
function relDate(iso: string | null) {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - new Date(iso as string).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [rfm, setRfm] = useState<RfmData | null>(null)
  const [avgBasket, setAvgBasket] = useState(0)
  const [loading, setLoading] = useState(true)
  const [insight, setInsight] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [editTag, setEditTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [showWinback, setShowWinback] = useState(false)
  const [winbackMsg, setWinbackMsg] = useState('')
  const [wbSending, setWbSending] = useState(false)
  const [wbResult, setWbResult] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const r = await fetch(`/api/customers/${id}`)
    if (!r.ok) { setLoading(false); return }
    const j = await r.json()
    setCustomer(j.customer)
    setSales(j.sales ?? [])
    setRfm(j.rfm ?? null)
    setAvgBasket(j.avgBasket ?? 0)
    const lv = (j.customer?.last_visit ?? j.customer?.last_visit_at ?? null) as string | null
    if (lv) {
      const days = Math.floor((Date.now() - new Date(lv).getTime()) / 86400000)
      if (days > 60) {
        const spend = coalesce(j.customer?.total_spent, j.customer?.total_spend)
        const visits = coalesce(j.customer?.visit_count)
        const bname = j.customer?.business_id ? '' : ''
        setWinbackMsg(`Hi ${String(j.customer?.name ?? '').split(' ')[0]}, we miss you! It's been ${days} days since your last visit. Come back and we'll take care of you. — ${bname}`)
      }
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const fetchInsight = async () => {
    if (!customer || !id) return
    setInsightLoading(true)
    const r = await fetch(`/api/customers/${id}/aria-insight`, { method: 'POST' })
    const j = await r.json()
    setInsight(j.insight ?? '')
    setInsightLoading(false)
  }

  const addTag = async () => {
    if (!editTag.trim() || !customer) return
    const currentTags = (customer.tags as string[] | null) ?? []
    if (currentTags.includes(editTag.trim())) { setEditTag(''); return }
    await patch({ tags: [...currentTags, editTag.trim()] })
    setEditTag('')
  }

  const removeTag = async (tag: string) => {
    if (!customer) return
    const currentTags = (customer.tags as string[] | null) ?? []
    await patch({ tags: currentTags.filter(t => t !== tag) })
  }

  const patch = async (updates: Record<string, unknown>) => {
    setSaving(true); setSaveMsg('')
    const r = await fetch(`/api/customers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const j = await r.json()
    if (r.ok) { setCustomer(j.customer); setSaveMsg('Saved') }
    else setSaveMsg(j.error ?? 'Failed')
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 2000)
  }

  const sendWinback = async () => {
    if (!winbackMsg.trim()) return
    setWbSending(true); setWbResult('')
    const r = await fetch(`/api/customers/${id}/winback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: winbackMsg }),
    })
    const j = await r.json()
    setWbResult(r.ok ? 'SMS sent!' : (j.error ?? 'Failed'))
    setWbSending(false)
    if (r.ok) setTimeout(() => setShowWinback(false), 1500)
  }

  if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
  if (!customer) return (
    <div className="p-6 space-y-3" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <p>Customer not found.</p>
      <Link href="/dashboard/customers" className="text-sm hover:underline" style={{ color: '#7FB897' }}>← Back to customers</Link>
    </div>
  )

  const name = String(customer.name ?? '')
  const spend = coalesce(customer.total_spent as number, customer.total_spend as number)
  const visits = coalesce(customer.visit_count as number)
  const lv = (customer.last_visit ?? customer.last_visit_at ?? null) as string | null
  const pts = coalesce(customer.loyalty_points as number, customer.points_balance as number)
  const tags = (customer.tags as string[] | null) ?? []
  const tier = spend >= 500 || visits >= 10 ? 'VIP' : spend >= 200 ? 'Regular' : visits === 1 ? 'New' : 'Standard'
  const rfmData = rfm ?? calcRFM(spend, visits, lv)
  const daysSince = lv ? Math.floor((Date.now() - new Date(lv).getTime()) / 86400000) : null
  const showWinbackButton = daysSince != null && daysSince > 60

  return (
    <div className="p-6 max-w-6xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-semibold bg-[#2D5240]">
            {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-medium">{name}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{String(customer.email ?? '')} {customer.phone ? `· ${String(customer.phone)}` : ''}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {saveMsg && <span className="text-xs" style={{ color: saveMsg === 'Saved' ? '#7FB897' : '#ef4444' }}>{saveMsg}</span>}
          {showWinbackButton && (
            <button onClick={() => setShowWinback(true)} className="px-4 py-1.5 text-sm rounded-lg font-medium"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
              Send winback
            </button>
          )}
          <Link href="/dashboard/customers" className="px-4 py-1.5 text-sm rounded-lg"
            style={{ border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-secondary, #A8B5A8)' }}>← Customers</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Lifetime spend', value: `$${spend.toFixed(2)}` },
              { label: 'Visits', value: String(visits) },
              { label: 'Avg basket', value: `$${avgBasket.toFixed(2)}` },
              { label: 'Last visit', value: relDate(lv) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-3" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{label}</div>
                <div className="text-lg font-medium" style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* RFM + loyalty */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>RFM Score</span>
              <span className="text-sm font-bold" style={{ color: TIER_COLOR[rfmData.tier] }}>{rfmData.tier.charAt(0).toUpperCase() + rfmData.tier.slice(1)} · {rfmData.total}/15</span>
            </div>
            <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              <span>R: {rfmData.r}</span><span>F: {rfmData.f}</span><span>M: {rfmData.m}</span>
            </div>
            <div className="pt-2 border-t" style={{ borderColor: 'var(--divider, rgba(232,237,231,0.06))' }}>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Loyalty tier</span>
                <span className="text-xs font-medium" style={{ color: tier === 'VIP' ? '#FFD700' : '#7FB897' }}>{tier}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Points</span>
                <span className="text-xs font-medium">{pts}</span>
              </div>
              {coalesce(customer.account_balance as number, customer.current_balance_cents as number) > 0 && (
                <div className="flex justify-between mt-1">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Store credit</span>
                  <span className="text-xs font-medium" style={{ color: '#7FB897' }}>
                    ${(coalesce(customer.account_balance as number) || coalesce(customer.current_balance_cents as number) / 100).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Identity details */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            {!!customer.birthday && <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Birthday</span><span>{String(customer.birthday)}</span></div>}
            {!!customer.abn && <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>ABN</span><span>{String(customer.abn)}</span></div>}
            <div className="flex justify-between text-sm items-center">
              <span style={{ color: 'var(--text-secondary)' }}>Marketing</span>
              <button onClick={() => patch({ marketing_consent: !customer.marketing_consent })} disabled={saving}
                className={`w-9 h-5 rounded-full relative transition-colors ${customer.marketing_consent ? 'bg-[#2D5240]' : 'bg-white/10'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${customer.marketing_consent ? 'left-4' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Tags */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Tags</p>
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(127,184,151,0.15)', color: '#7FB897' }}>
                  {t}
                  <button onClick={() => removeTag(t)} className="opacity-60 hover:opacity-100">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={editTag} onChange={e => setEditTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Add tag…" className="flex-1 px-2 py-1 rounded text-xs"
                style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
              <button onClick={addTag} className="px-3 py-1 text-xs rounded" style={{ background: '#2D5240', color: '#7FB897' }}>Add</button>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Notes</p>
            <textarea rows={3} value={String(customer.notes ?? '')}
              onChange={e => setCustomer(c => c ? { ...c, notes: e.target.value } : c)}
              onBlur={() => patch({ notes: customer.notes })}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
          </div>
        </div>

        {/* Right column — purchase history */}
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            <div className="px-4 py-3" style={{ background: 'var(--bg-elevated, #1A2620)', borderBottom: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
              <p className="text-sm font-medium">Purchase history <span className="text-xs ml-1" style={{ color: 'var(--text-secondary)' }}>({sales.length} sales)</span></p>
            </div>
            {sales.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No purchases recorded yet.</div>
            ) : (
              <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
                {sales.map(s => (
                  <div key={s.id} className="px-4 py-3 flex justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">${Number(s.total_amount).toFixed(2)}</span>
                        {s.payment_method && <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>{s.payment_method}</span>}
                      </div>
                      {(s.pos_sale_items ?? []).length > 0 && (
                        <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                          {(s.pos_sale_items ?? []).map(i => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="text-xs shrink-0 text-right" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                      {new Date(s.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Aria insight */}
      <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-elevated, #1A2620)', borderLeft: '3px solid #1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ color: '#1D9E75' }}>✦</span>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Aria Insight</p>
          </div>
          <button onClick={fetchInsight} disabled={insightLoading} className="text-xs px-3 py-1 rounded-lg disabled:opacity-50"
            style={{ background: 'rgba(45,82,64,0.3)', color: '#7FB897', border: '1px solid rgba(45,82,64,0.4)' }}>
            {insightLoading ? 'Analysing…' : insight ? 'Refresh' : 'Get Aria insight'}
          </button>
        </div>
        {insight ? (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{insight}</p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Click "Get Aria insight" for an AI-generated customer summary and recommended action.</p>
        )}
      </div>

      {/* Winback modal */}
      {showWinback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <div className="flex justify-between items-center">
              <p className="font-medium text-sm">Send winback message to {name}</p>
              <button onClick={() => setShowWinback(false)} style={{ color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <textarea rows={4} value={winbackMsg} onChange={e => setWinbackMsg(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-primary)' }} />
            {wbResult && <p className="text-xs" style={{ color: wbResult === 'SMS sent!' ? '#7FB897' : '#ef4444' }}>{wbResult}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowWinback(false)} className="px-4 py-2 text-xs rounded-lg" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={sendWinback} disabled={wbSending} className="px-4 py-2 text-xs rounded-lg font-medium disabled:opacity-50" style={{ background: '#2D5240', color: '#7FB897' }}>
                {wbSending ? 'Sending…' : 'Send SMS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
