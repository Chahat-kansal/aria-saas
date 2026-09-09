'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { buildSurchargeBanCard } from '@/lib/aria/compute/surcharge-card'

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

interface ImpactItem {
  id: string; name: string; price: number; units_sold: number | null
  revenue: number | null; recovering_price: number | null
  margin_dollars: number | null; margin_tier: Tier; cost_note: string
}
interface ImpactPayload {
  ok: boolean
  summary: { recovery_pct: number; recovery_tier: Tier; total_surcharge_lost: number | null
             cost_quality: { total: number; usable: number; back_calculated: number; missing: number }
             unknowns: string[] }
  items: ImpactItem[]
}
interface ProposalResult {
  ok: boolean; created: boolean; decision_id?: string; reason?: string
  requires_stepup?: boolean; stepup_reason?: string | null; reasoning?: string
  proposal?: { applied_pct: number; total_revenue_effect: number | null; total_rounding_drift: number
               lines: Array<{ id: string; name: string; current_price: number; proposed_price: number; rounding_drift: number }> }
  comparison?: Array<{ policy: string; applied_pct: number; proposed_price: number; change: number; absorbed_per_sale: number }> | null
}

const POLICY_LABEL: Record<string, string> = {
  recover_full: 'Recover it fully',
  recover_half: 'Recover half',
  absorb: 'Absorb it',
}

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
  const [impact, setImpact] = useState<ImpactPayload | null>(null)
  const [policy, setPolicy] = useState<'recover_full' | 'recover_half' | 'absorb'>('recover_full')
  const [rounding, setRounding] = useState<'exact' | 'nearest_5c' | 'nearest_10c' | 'nearest_50c'>('nearest_10c')
  const [proposal, setProposal] = useState<ProposalResult | null>(null)
  const [proposing, setProposing] = useState(false)
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
      const imp = await fetch('/api/pricing/item-impact?days=90')
      if (imp.ok) setImpact(await imp.json() as ImpactPayload)
    } catch (e) {
      // Never a silent empty screen — the owner must know the difference between "nothing to
      // report" and "we could not ask".
      setError((e as Error).message || 'Could not load your card position.')
    }
    setLoading(false)
  }, [bid])

  useEffect(() => { void load() }, [load])

  // ⚠️ THIS BUTTON DOES NOT CHANGE A PRICE. It writes one pending decision the owner then approves
  // in Decisions, where a money decision demands a step-up. Nothing on the menu moves until then.
  const propose = useCallback(async () => {
    setProposing(true)
    setProposal(null)
    try {
      const res = await fetch('/api/pricing/surcharge-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy, rounding, window_days: 90 }),
      })
      setProposal(await res.json() as ProposalResult)
    } catch (e) {
      setProposal({ ok: false, created: false, reason: (e as Error).message })
    }
    setProposing(false)
  }, [policy, rounding])

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

      {/* The same card every AU venue sees elsewhere, rendered here too so the screen leads with
          the one sentence that is true for THIS venue rather than a generic deadline. */}
      {a && (() => {
        const card = buildSurchargeBanCard(a)
        return (
          <div style={{
            marginTop: 16, padding: 16, borderRadius: 12,
            background: card.severity === 'warning' ? 'rgba(245,158,11,0.07)' : 'rgba(127,184,151,0.07)',
            border: '1px solid ' + (card.severity === 'warning' ? 'rgba(245,158,11,0.25)' : 'rgba(127,184,151,0.22)'),
          }}>
            <div style={{ color: card.severity === 'warning' ? '#F59E0B' : '#7FB897', fontSize: 14, fontWeight: 600 }}>{card.title}</div>
            <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.72)', fontSize: 13.5, lineHeight: 1.6 }}>{card.body}</p>
          </div>
        )
      })()}

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

          {/* ── what it does to each item, and the one button ───────────────────────────── */}
          {impact?.ok && (
            <div style={{ marginTop: 16, padding: 18, background: surface, border, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
                  What Aria proposes
                </div>
                <TierChip tier={impact.summary.recovery_tier} />
              </div>

              <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.68)', fontSize: 13.5, lineHeight: 1.6 }}>
                {impact.summary.recovery_pct === 0
                  ? 'You lose nothing on 1 October, so Aria proposes no price change. The table below is your menu as it stands.'
                  : 'Recovering what you stop collecting needs a ' + impact.summary.recovery_pct + '% rise. Choose how much of it to pass on.'}
              </p>

              {impact.summary.recovery_pct > 0 && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    {(['recover_full', 'recover_half', 'absorb'] as const).map(p => (
                      <button key={p} onClick={() => setPolicy(p)} style={{
                        padding: '7px 14px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                        background: policy === p ? 'rgba(127,184,151,0.16)' : 'transparent',
                        border: '1px solid ' + (policy === p ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.12)'),
                        color: policy === p ? '#7FB897' : 'rgba(255,255,255,0.6)',
                      }}>{POLICY_LABEL[p]}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Round to</span>
                    {(['exact', 'nearest_5c', 'nearest_10c', 'nearest_50c'] as const).map(r => (
                      <button key={r} onClick={() => setRounding(r)} style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                        background: rounding === r ? 'rgba(255,255,255,0.08)' : 'transparent',
                        border: '1px solid ' + (rounding === r ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'),
                        color: rounding === r ? '#fff' : 'rgba(255,255,255,0.5)',
                      }}>{r === 'exact' ? 'the cent' : r.replace('nearest_', '')}</button>
                    ))}
                  </div>

                  <button onClick={() => void propose()} disabled={proposing} style={{
                    marginTop: 16, padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                    cursor: proposing ? 'wait' : 'pointer', background: '#2D5240',
                    border: '1px solid rgba(127,184,151,0.45)', color: '#fff',
                  }}>{proposing ? 'Working it out…' : 'Prepare the price change for approval'}</button>
                  <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.35)', fontSize: 11.5 }}>
                    This does not change any price. It prepares a change for you to approve.
                  </p>
                </>
              )}

              {proposal && (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'rgba(127,184,151,0.07)', border: '1px solid rgba(127,184,151,0.25)' }}>
                  {proposal.created ? (
                    <>
                      <div style={{ color: '#7FB897', fontSize: 13.5, fontWeight: 600 }}>Ready for your approval</div>
                      {proposal.reasoning && <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.55 }}>{proposal.reasoning}</p>}
                      {proposal.proposal && (
                        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.55)', fontSize: 12.5 }}>
                          {proposal.proposal.lines.length} prices · {proposal.proposal.applied_pct}% ·
                          {proposal.proposal.total_revenue_effect == null
                            ? ' effect over a year unknown'
                            : ' about $' + proposal.proposal.total_revenue_effect.toFixed(2) + ' a year'}
                          {' · rounding adds $' + proposal.proposal.total_rounding_drift.toFixed(2)}
                        </p>
                      )}
                      {proposal.requires_stepup && (
                        <p style={{ margin: '8px 0 0', color: '#F59E0B', fontSize: 12.5 }}>
                          You will be asked to confirm it&apos;s you. {proposal.stepup_reason}
                        </p>
                      )}
                      <a href="/dashboard/decisions" style={{ display: 'inline-block', marginTop: 10, color: '#7FB897', fontSize: 13, fontWeight: 600 }}>
                        Go to Decisions to approve →
                      </a>
                    </>
                  ) : (
                    <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>{proposal.reason ?? 'Nothing to propose.'}</div>
                  )}
                </div>
              )}

              {/* ── the per-item table ───────────────────────────────────────────────────── */}
              <div style={{ marginTop: 18, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px', fontWeight: 500 }}>Item</th>
                      <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Now</th>
                      <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Proposed</th>
                      <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Sold (90d)</th>
                      <th style={{ padding: '6px 8px', fontWeight: 500 }}>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.items.slice(0, 15).map(it => (
                      <tr key={it.id} style={{ borderTop: border }}>
                        <td style={{ padding: '7px 8px', color: '#fff' }}>{it.name}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>${it.price.toFixed(2)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: it.recovering_price && it.recovering_price !== it.price ? '#7FB897' : 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>
                          {it.recovering_price == null ? '—' : '$' + it.recovering_price.toFixed(2)}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
                          {it.units_sold == null ? 'unknown' : it.units_sold}
                        </td>
                        <td style={{ padding: '7px 8px' }}>
                          {it.margin_dollars == null
                            ? <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{it.cost_note}</span>
                            : <span style={{ color: 'rgba(255,255,255,0.7)' }}>${it.margin_dollars.toFixed(2)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {impact.summary.unknowns.map((u, i) => (
                <p key={i} style={{ margin: '10px 0 0', color: 'rgba(245,158,11,0.85)', fontSize: 12.5, lineHeight: 1.55 }}>{u}</p>
              ))}
            </div>
          )}

          <p style={{ marginTop: 18, color: 'rgba(255,255,255,0.3)', fontSize: 11.5 }}>
            Caps from the Reserve Bank&apos;s Review of Merchant Card Payment Costs and Surcharging,
            Conclusions Paper. <a href={f.source} target="_blank" rel="noreferrer" style={{ color: 'rgba(127,184,151,0.8)' }}>Read the source</a>.
          </p>
        </>
      )}
    </div>
  )
}
