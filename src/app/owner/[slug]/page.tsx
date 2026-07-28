'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useOwnerBusiness } from './OwnerBusinessContext'
import { DecisionCard } from '@/components/owner-app/DecisionCard'
import { DecisionSheet } from '@/components/owner-app/DecisionSheet'
import { PushOptIn } from '@/components/owner-app/PushOptIn'
import { INK, SUBTEXT, BORDER, FONT_MONO, formatDollars } from '@/app/owner/theme'
import type { OwnerDecision } from '@/lib/owner-app/decisions'

interface TodayData {
  sales: number
  covers: number
  labour_pct: number
  active_staff_names: string[]
  handled_today: number
  exceptions: Array<{ id: string; title: string; description: string | null; monthly_loss: number | null }>
  top_decisions: OwnerDecision[]
  waiting_count: number
}

export default function OwnerTodayPage() {
  const business = useOwnerBusiness()
  const [data, setData] = useState<TodayData | null>(null)
  const [openDecision, setOpenDecision] = useState<OwnerDecision | null>(null)

  async function load() {
    const res = await fetch('/api/owner/today?business_id=' + business.id)
    if (res.ok) setData(await res.json())
  }
  useEffect(() => { load() }, [business.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div style={{ padding: 20, color: SUBTEXT, fontSize: 14 }}>Loading…</div>

  const coveringLine = data.active_staff_names.length > 0
    ? data.active_staff_names.join(' & ') + ' has the counter. Tills and service stay on Canopy.'
    : 'Nobody\'s clocked in right now. Tills and service stay on Canopy.'

  return (
    <div style={{ padding: '20px 20px 24px' }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: SUBTEXT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {data.waiting_count} decision{data.waiting_count === 1 ? '' : 's'}
      </div>
      <div style={{ fontWeight: 700, fontSize: 30, color: INK, lineHeight: 1.1, marginTop: 2 }}>waiting on you.</div>
      <div style={{ fontSize: 14, color: SUBTEXT, marginTop: 8, lineHeight: 1.5 }}>
        {data.handled_today} handled today. {coveringLine}
      </div>

      <div style={{ marginTop: 20, background: INK, borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 10, color: '#d9f54e', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <span>Today so far</span>
          <span>Live from the counter</span>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 24, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{formatDollars(Math.round(data.sales * 100))}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8a8a8a', marginTop: 2 }}>SALES</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 24, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{data.covers}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8a8a8a', marginTop: 2 }}>COVERS</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 24, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{data.labour_pct}%</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8a8a8a', marginTop: 2 }}>LABOUR</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: SUBTEXT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Needs a decision</div>
        <Link href={'/owner/' + business.slug + '/decisions'} style={{ fontSize: 13, color: INK, fontWeight: 600, textDecoration: 'none' }}>See all →</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.top_decisions.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: SUBTEXT, fontSize: 13, border: '1px dashed ' + BORDER, borderRadius: 12 }}>
            Nothing needs you right now.
          </div>
        )}
        {data.top_decisions.map(d => (
          <DecisionCard key={d.id} decision={d} onClick={() => setOpenDecision(d)} />
        ))}
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: SUBTEXT, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 28, marginBottom: 10 }}>
        Only what&apos;s off
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.exceptions.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: SUBTEXT, fontSize: 13, border: '1px dashed ' + BORDER, borderRadius: 12 }}>
            Nothing's off — the floor's running clean.
          </div>
        )}
        {data.exceptions.map(e => (
          <div key={e.id} style={{ background: '#fff', border: '1px solid ' + BORDER, borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>{e.title}</div>
            {e.description && <div style={{ fontSize: 13, color: SUBTEXT, marginTop: 2 }}>{e.description}</div>}
            {e.monthly_loss != null && (
              <div style={{ fontSize: 13, color: '#b91c1c', marginTop: 6, fontWeight: 600 }}>{formatDollars(Math.round(e.monthly_loss * 100))}/mo</div>
            )}
          </div>
        ))}
      </div>

      {/* OWNER-APP PH-4 — sits below the fold, after the owner has seen what actually needs them.
          Push is additive: the waiting-decision count above is always the immediate in-app signal,
          whether or not notifications are ever enabled. */}
      <PushOptIn businessId={business.id} />

      {openDecision && (
        <DecisionSheet
          decision={openDecision}
          business_id={business.id}
          onClose={() => setOpenDecision(null)}
          onResolved={() => { setOpenDecision(null); load() }}
        />
      )}
    </div>
  )
}
