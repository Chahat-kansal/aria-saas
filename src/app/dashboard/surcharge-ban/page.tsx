'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

/**
 * M14 PHASE 1 — WHAT CHANGES ON 1 OCTOBER, AND WHAT WE CAN AND CANNOT SEE.
 *
 * Phase 6 extends this same screen with the price proposal and the approve button. There is one
 * screen for this deadline, not two.
 *
 * ⚠️ Every figure renders with its tier, and the "what we cannot see" panel is not collapsible and
 * not below the fold. An owner has 25 days to price this and the half of the picture we do not
 * have matters as much as the half we do.
 */

type Tier = 'verified' | 'derived' | 'estimated' | 'stated' | 'not_connected'

interface Band { pct: number; basis: string }
interface Assessment {
  surcharge_today_pct: number | null
  surcharge_tier: Tier
  card_share_pct: number | null
  card_share_tier: Tier
  interchange_before: Band | null
  interchange_after: Band | null
  interchange_after_range: { low: Band; high: Band } | null
  interchange_tier: Tier
  merchant_service_fee_pct: number | null
  merchant_service_fee_tier: Tier
  least_cost_routing: 'on' | 'off' | 'not_connected'
  unknowns: string[]
  action_required: boolean
}
interface Facts {
  effective: string
  effective_foreign: string
  mechanism: string
  source: string
  caps: {
    domestic_debit: { cents: number; pct: number }
    domestic_consumer_credit: { pct: number }
    domestic_commercial_credit: { pct: number }
    foreign: { pct: number }
  }
  previous_caps: {
    domestic_debit: { cents: number; pct: number }
    domestic_consumer_credit: { pct: number }
  }
}
interface Payload { ok: boolean; facts: Facts; assessment: Assessment; notes: string[] }

const surface = 'rgba(255,255,255,0.04)'
const border = '1px solid rgba(255,255,255,0.08)'

const TIER_LABEL: Record<Tier, string> = {
  verified: 'from your records',
  derived: 'calculated from your records',
  estimated: 'estimated — see below',
  stated: 'as you entered it',
  not_connected: 'not connected',
}
const TIER_COLOR: Record<Tier, string> = {
  verified: '#7FB897',
  derived: 'rgba(127,184,151,0.75)',
  estimated: '#F59E0B',
  stated: 'rgba(255,255,255,0.55)',
  not_connected: 'rgba(255,255,255,0.35)',
}

function TierChip({ tier }: { tier: Tier }) {
  return (
    <span style={{
      fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: TIER_COLOR[tier], border: '1px solid ' + TIER_COLOR[tier].replace(')', ',0.35)').replace('rgb', 'rgba'),
      borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
    }}>{TIER_LABEL[tier]}</span>
  )
}

function daysUntil(iso: string): number {
  const then = new Date(iso + 'T00:00:00+10:00').getTime()
  return Math.ceil((then - Date.now()) / 86400000)
}

export default function SurchargeBanPage() {
  const { business } = useBusinessContext()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bid = business?.id

  const load = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pricing/card-cost')
      if (!res.ok) { setError('Could not load your card position (' + res.status + ').'); setLoading(false); return }
      setData(await res.json() as Payload)
    } catch (e) {
      // Never a silent empty screen — the owner must know the difference between "nothing to
      // report" and "we could not ask".
      setError((e as Error).message || 'Could not load your card position.')
    }
    setLoading(false)
  }, [bid])

  useEffect(() => { void load() }, [load])

  const a = data?.assessment
  const f = data?.facts
  const days = f ? daysUntil(f.effective) : null

  return (
    <div style={{ padding: '28px 24px 64px', maxWidth: 940, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 30, margin: 0, color: '#fff' }}>
        Card surcharging changes on 1 October
      </h1>

      {f && (
        <p style={{ marginTop: 10, color: 'rgba(255,255,255,0.68)', lineHeight: 1.6, fontSize: 14, maxWidth: 720 }}>
          {f.mechanism}
          {days !== null && days > 0 ? ' That is ' + days + ' days away.' : ''}
        </p>
      )}

      {loading && <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 24 }}>Reading your settings and payments…</p>}
      {error && (
        <div style={{ marginTop: 20, padding: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, color: '#FCA5A5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {a && f && (
        <>
          {/* ── what it means for THIS venue ─────────────────────────────────────────────────── */}
          <div style={{ marginTop: 22, padding: 18, background: surface, border, borderRadius: 12 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
              What it means for you
            </div>
            <p style={{ margin: '10px 0 0', color: '#fff', fontSize: 16, lineHeight: 1.55 }}>
              {a.action_required
                ? 'You add a card fee at the terminal today. From 1 October you will not be able to, so it has to go into your prices or come out of your margin.'
                : 'You do not add a card fee today, so nothing is taken away from you on 1 October. What changes is that the interchange caps fall — the wholesale part of your card cost gets cheaper.'}
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                Your surcharge today: <strong style={{ color: '#fff' }}>
                  {a.surcharge_today_pct == null ? 'not recorded' : a.surcharge_today_pct.toFixed(2) + '%'}
                </strong>
              </span>
              <TierChip tier={a.surcharge_tier} />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                Share of takings on card: <strong style={{ color: '#fff' }}>
                  {a.card_share_pct == null ? 'unknown' : a.card_share_pct.toFixed(1) + '%'}
                </strong>
              </span>
              <TierChip tier={a.card_share_tier} />
            </div>
          </div>

          {/* ── the interchange picture ──────────────────────────────────────────────────────── */}
          <div style={{ marginTop: 16, padding: 18, background: surface, border, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
                Interchange — the wholesale part of a card payment
              </div>
              <TierChip tier={a.interchange_tier} />
            </div>

            {a.interchange_before && a.interchange_after ? (
              <div style={{ display: 'flex', gap: 26, marginTop: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Until 30 September</div>
                  <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 26, color: '#fff' }}>
                    {a.interchange_before.pct.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>From 1 October</div>
                  <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 26, color: '#7FB897' }}>
                    {a.interchange_after.pct.toFixed(2)}%
                  </div>
                </div>
              </div>
            ) : a.interchange_after_range ? (
              <>
                <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,0.68)', fontSize: 13.5, lineHeight: 1.6 }}>
                  Your POS records a payment as “card” without saying whether it was debit, credit or
                  an overseas card, so we cannot blend your actual rate. From 1 October it must fall
                  between these two, whatever your mix turns out to be:
                </p>
                <div style={{ display: 'flex', gap: 26, marginTop: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{a.interchange_after_range.low.basis}</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 26, color: '#7FB897' }}>
                      {a.interchange_after_range.low.pct.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{a.interchange_after_range.high.basis}</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 26, color: '#fff' }}>
                      {a.interchange_after_range.high.pct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: border, display: 'grid', gap: 6 }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5 }}>
                Debit &amp; prepaid: {f.previous_caps.domestic_debit.cents}c or {f.previous_caps.domestic_debit.pct}%
                {' → '}<strong style={{ color: '#7FB897' }}>{f.caps.domestic_debit.cents}c or {f.caps.domestic_debit.pct}%</strong>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5 }}>
                Consumer credit: {f.previous_caps.domestic_consumer_credit.pct}%
                {' → '}<strong style={{ color: '#7FB897' }}>{f.caps.domestic_consumer_credit.pct}%</strong>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5 }}>
                Business credit cards: <strong style={{ color: '#fff' }}>{f.caps.domestic_commercial_credit.pct}% — unchanged</strong>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5 }}>
                Overseas-issued cards: capped at {f.caps.foreign.pct}% from {f.effective_foreign}
              </div>
            </div>
          </div>

          {/* ── ⚠️ what we cannot see. Never collapsed, never below the fold. ────────────────── */}
          <div style={{ marginTop: 16, padding: 18, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: 12 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#F59E0B' }}>
              What we cannot see
            </div>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'rgba(255,255,255,0.72)', fontSize: 13.5, lineHeight: 1.65 }}>
              {a.unknowns.map((u, i) => <li key={i} style={{ marginBottom: 6 }}>{u}</li>)}
            </ul>
            {data!.notes.map((n, i) => (
              <p key={i} style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{n}</p>
            ))}
          </div>

          <p style={{ marginTop: 18, color: 'rgba(255,255,255,0.3)', fontSize: 11.5 }}>
            Caps from the Reserve Bank&apos;s Review of Merchant Card Payment Costs and Surcharging,
            Conclusions Paper. <a href={f.source} target="_blank" rel="noreferrer" style={{ color: 'rgba(127,184,151,0.8)' }}>Read the source</a>.
          </p>
        </>
      )}
    </div>
  )
}
