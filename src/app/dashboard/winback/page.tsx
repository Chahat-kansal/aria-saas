'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface LapsedCustomer { id: string; name: string; phone: string | null; email: string | null; last_visit_at: string | null; total_spend: number | null }
interface Campaign { id: string; name: string | null; message: string | null; email_subject: string | null; channel: string | null; status: string | null; created_at: string; recipients_count: number | null; returned_customers: number | null; attributed_revenue: number | null; roi_percent: number | null; ab_variant: string | null }
interface Automation { id: string | null; trigger_type: string; label?: string; desc?: string; is_active: boolean; sms_message: string | null; email_subject: string | null; email_body: string | null }
interface ComposeResult { audience_filter: { lapsed_days: number }; sms_message: string; email_subject: string; email_body: string; suggested_send_time: string; estimated_reach: number }
interface SendResult { campaign_id: string; scheduled: boolean; will_send_sms: number; will_send_email: number; total: number }
interface SequenceStepDraft { delay_days: number; message: string; condition: 'always' | 'if_not_returned' }
interface SequenceCampaign { id: string; name: string | null; status: string | null; created_at: string; recipients_count: number | null; returned_customers: number | null; roi_percent: number | null; sequence_steps: SequenceStepDraft[] | null }

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', amber: '#F59E0B', violet: '#8B5CF6', red: '#EF4444', blue: '#3B82F6',
  border: 'rgba(255,255,255,0.07)',
}

function daysAgo(d: string | null) {
  return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null
}
function stripHtml(s: string) { return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) }

export default function WinbackPage() {
  const { business } = useBusinessContext()
  const [tab, setTab] = useState<'campaigns' | 'sequences' | 'automations'>('campaigns')
  const [lapsedDays, setLapsedDays] = useState(60)
  const [customers, setCustomers] = useState<LapsedCustomer[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [composePrompt, setComposePrompt] = useState('')
  const [composing, setComposing] = useState(false)
  const [composed, setComposed] = useState<ComposeResult | null>(null)
  const [channel, setChannel] = useState<'sms' | 'email' | 'both'>('both')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const [savingAuto, setSavingAuto] = useState<string | null>(null)
  const [sequences, setSequences] = useState<SequenceCampaign[]>([])
  const [seqSteps, setSeqSteps] = useState<SequenceStepDraft[]>([
    { delay_days: 0, message: '', condition: 'always' },
    { delay_days: 3, message: '', condition: 'if_not_returned' },
    { delay_days: 7, message: '', condition: 'if_not_returned' },
  ])
  const [seqLaunching, setSeqLaunching] = useState(false)
  const [seqResult, setSeqResult] = useState<{ campaign_id: string; customers: number; sends_scheduled: number } | null>(null)
  const [enableAB, setEnableAB] = useState(false)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const cutoff = new Date(Date.now() - lapsedDays * 86400000).toISOString()
    const [cR, campR, autoR, seqR] = await Promise.all([
      fetch('/api/pos/customers?business_id=' + business.id + '&limit=200').then(r => r.json()).catch(() => ({ customers: [] })),
      fetch('/api/campaigns?business_id=' + business.id + '&type=winback').then(r => r.json()).catch(() => ({ campaigns: [] })),
      fetch('/api/aria/winback-automations?business_id=' + business.id).then(r => r.json()).catch(() => ({ automations: [] })),
      fetch('/api/aria/winback-sequence?business_id=' + business.id).then(r => r.json()).catch(() => ({ sequences: [] })),
    ])
    const all: LapsedCustomer[] = cR.customers ?? cR.data ?? []
    const lapsed = all.filter(c => !c.last_visit_at || c.last_visit_at < cutoff)
    setCustomers(lapsed)
    setCampaigns(campR.campaigns ?? campR.data ?? [])
    setAutomations(autoR.automations ?? [])
    setSequences(seqR.sequences ?? [])
    const init: Record<string, boolean> = {}
    lapsed.forEach(c => { if (c.phone || c.email) init[c.id] = true })
    setSelected(init)
    setLoading(false)
  }, [business?.id, lapsedDays])

  useEffect(() => { load() }, [load])

  async function compose() {
    if (!business?.id || !composePrompt.trim()) return
    setComposing(true); setSendResult(null)
    try {
      const res = await fetch('/api/aria/winback-compose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, prompt: composePrompt }),
      }).then(r => r.json())
      setComposed(res)
    } catch { /* keep */ }
    setComposing(false)
  }

  async function scheduleSend() {
    if (!business?.id || !composed) return
    const ids = customers.filter(c => selected[c.id]).map(c => c.id)
    if (!ids.length) return
    setSending(true)
    try {
      const res = await fetch('/api/aria/winback-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, customer_ids: ids, sms_message: composed.sms_message, email_subject: composed.email_subject, email_body: composed.email_body, channel, enable_ab_test: enableAB }),
      }).then(r => r.json())
      setSendResult(res); load()
    } catch (e) { console.warn('[non-fatal]', e) }
    setSending(false)
  }

  async function toggleAuto(auto: Automation) {
    if (!business?.id) return
    setSavingAuto(auto.trigger_type)
    await fetch('/api/aria/winback-automations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, trigger_type: auto.trigger_type, is_active: !auto.is_active, sms_message: auto.sms_message, email_subject: auto.email_subject, email_body: auto.email_body }),
    }).catch(() => null)
    setAutomations(prev => prev.map(a => a.trigger_type === auto.trigger_type ? { ...a, is_active: !a.is_active } : a))
    setSavingAuto(null)
  }

  async function launchSequence() {
    if (!business?.id) return
    const ids = customers.filter(c => selected[c.id]).map(c => c.id)
    const validSteps = seqSteps.filter(s => s.message.trim())
    if (!ids.length || !validSteps.length) return
    setSeqLaunching(true)
    try {
      const res = await fetch('/api/aria/winback-sequence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, customer_ids: ids, steps: validSteps }),
      }).then(r => r.json())
      setSeqResult(res); load()
    } catch (e) { console.warn('[non-fatal]', e) }
    setSeqLaunching(false)
  }

  const selectedCount = Object.values(selected).filter(Boolean).length
  const reachable = customers.filter(c => c.phone || c.email)
  const allSel = reachable.length > 0 && reachable.every(c => selected[c.id])
  const wonBack = campaigns.reduce((s, c) => s + (c.returned_customers ?? 0), 0)
  const totalRev = campaigns.reduce((s, c) => s + (c.attributed_revenue ?? 0), 0)
  const roiCamps = campaigns.filter(c => (c.roi_percent ?? 0) > 0)
  const avgRoi = roiCamps.length ? Math.round(roiCamps.reduce((s, c) => s + (c.roi_percent ?? 0), 0) / roiCamps.length) : 0

  const inp = { background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Customer Winback</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Klaviyo-level AI campaigns for Australian small business.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.muted }}>Lapsed after</span>
          {[30, 60, 90].map(d => (
            <button key={d} onClick={() => setLapsedDays(d)}
              style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid ' + (lapsedDays === d ? C.violet : C.border), background: lapsedDays === d ? 'rgba(139,92,246,0.12)' : 'transparent', color: lapsedDays === d ? C.violet : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid ' + C.border, marginBottom: 24 }}>
        {(['campaigns', 'sequences', 'automations'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '10px 18px', border: 'none', borderBottom: '2px solid ' + (tab === t ? C.violet : 'transparent'), background: 'transparent', color: tab === t ? C.text : C.muted, fontSize: 13, fontWeight: tab === t ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', transition: 'color 0.2s ease' }}>
            {t === 'campaigns' ? `Campaigns (${campaigns.length})` : t === 'sequences' ? `Sequences (${sequences.length})` : `Automations (${automations.filter(a => a.is_active).length} active)`}
          </button>
        ))}
      </div>

      {tab === 'campaigns' && (
        <>
          {/* AI Composer */}
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>✨ AI Campaign Composer</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: composed ? 16 : 0 }}>
              <input value={composePrompt} onChange={e => setComposePrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && compose()}
                placeholder={`e.g. "Winback customers who haven't visited in 60 days with a 10% discount"`}
                style={{ ...inp, flex: 1, width: '100%' }} />
              <button onClick={compose} disabled={composing || !composePrompt.trim()}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: composePrompt.trim() ? C.violet : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: composePrompt.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: composing ? 0.6 : 1, transition: 'all 0.2s ease' }}>
                {composing ? 'Composing...' : '✨ Compose'}
              </button>
            </div>

            {composed && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.violet, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>SMS Preview</div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{composed.sms_message}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 8 }}>{composed.sms_message.length}/160 · Personalised send time per customer</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email Preview</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>{composed.email_subject}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{stripHtml(composed.email_body)}...</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 8 }}>Est. reach: {composed.estimated_reach} customers · Best time: {composed.suggested_send_time} AEST</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['sms', 'email', 'both'] as const).map(ch => (
                      <button key={ch} onClick={() => setChannel(ch)}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + (channel === ch ? C.violet : C.border), background: channel === ch ? 'rgba(139,92,246,0.12)' : 'transparent', color: channel === ch ? C.violet : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', transition: 'all 0.2s ease' }}>
                        {ch === 'both' ? 'SMS + Email' : ch.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setEnableAB(v => !v)}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + (enableAB ? C.amber : C.border), background: enableAB ? 'rgba(245,158,11,0.12)' : 'transparent', color: enableAB ? C.amber : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease' }}>
                    {enableAB ? '⚡ A/B On' : 'A/B Test'}
                  </button>
                  <button onClick={scheduleSend} disabled={sending || selectedCount === 0}
                    style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: selectedCount > 0 ? C.green : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: selectedCount > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: sending ? 0.6 : 1, transition: 'all 0.2s ease' }}>
                    {sending ? 'Scheduling...' : `Schedule for ${selectedCount} customer${selectedCount !== 1 ? 's' : ''}`}
                  </button>
                  {sendResult && (
                    <div style={{ fontSize: 12, color: C.green, padding: '8px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8 }}>
                      ✓ Scheduled: {sendResult.will_send_sms} SMS + {sendResult.will_send_email} emails — Aria will send at each customer&apos;s best time
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Metrics strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Campaigns', value: campaigns.length, color: C.violet },
              { label: 'Customers Won Back', value: wonBack, color: C.green },
              { label: 'Revenue Attributed', value: `A$${totalRev.toFixed(0)}`, color: C.amber },
              { label: 'Avg ROI', value: avgRoi > 0 ? `${avgRoi}%` : '—', color: avgRoi > 0 ? C.green : C.muted },
            ].map(m => (
              <div key={m.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Customer list */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>Lapsed Customers ({customers.length})</p>
                <button onClick={() => { const n: Record<string, boolean> = {}; if (!allSel) reachable.forEach(c => { n[c.id] = true }); setSelected(n) }}
                  style={{ fontSize: 11, color: C.violet, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                  {allSel ? 'Deselect all' : 'Select all reachable'}
                </button>
              </div>
              {loading ? (
                <div style={{ color: C.muted, textAlign: 'center', padding: 32 }}>Loading...</div>
              ) : customers.length === 0 ? (
                <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 24, textAlign: 'center' }}>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>No lapsed customers</p>
                  <p style={{ fontSize: 13, color: C.muted }}>All customers visited within {lapsedDays} days.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 420, overflowY: 'auto' }}>
                  {customers.map(c => {
                    const days = daysAgo(c.last_visit_at)
                    const sel = selected[c.id]
                    const reach = !!(c.phone || c.email)
                    return (
                      <div key={c.id} onClick={() => reach && setSelected(p => ({ ...p, [c.id]: !p[c.id] }))}
                        style={{ background: sel ? 'rgba(139,92,246,0.08)' : C.card, border: '1px solid ' + (sel ? 'rgba(139,92,246,0.3)' : C.border), borderRadius: 10, padding: '10px 14px', cursor: reach ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s ease' }}>
                        <div style={{ width: 15, height: 15, borderRadius: 4, border: '1px solid ' + (sel ? C.violet : C.border), background: sel ? C.violet : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}>
                          {sel && <span style={{ color: '#fff', fontSize: 9 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>
                            {[c.phone ? 'SMS' : null, c.email ? 'Email' : null].filter(Boolean).join(' + ') || 'No contact'}
                            {c.total_spend ? ' · A$' + Number(c.total_spend).toFixed(0) : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: (days ?? 0) > 90 ? C.red : C.amber, flexShrink: 0 }}>
                          {days != null ? days + 'd ago' : 'Never'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Campaign history */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Campaign History</p>
              {campaigns.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 32 }}>No campaigns yet — compose your first above.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
                  {campaigns.map(c => (
                    <div key={c.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ fontSize: 13, fontWeight: 600 }}>{c.name ?? 'Winback Campaign'}</p>
                          {c.ab_variant && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: c.ab_variant === 'A' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)', color: c.ab_variant === 'A' ? C.blue : C.amber, fontWeight: 700 }}>{c.ab_variant}</span>}
                        </div>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: c.status === 'sent' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: c.status === 'sent' ? C.green : C.muted }}>{c.status ?? 'scheduled'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4 }}>
                        {([['Sent to', c.recipients_count ?? 0], ['Returned', c.returned_customers ?? 0], ['Revenue', 'A$' + (c.attributed_revenue ?? 0).toFixed(0)], ['ROI', (c.roi_percent ?? 0) > 0 ? (c.roi_percent ?? 0) + '%' : '—']] as [string, string | number][]).map(([label, val]) => (
                          <div key={label}>
                            <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>{new Date(c.created_at).toLocaleDateString('en-AU')} · {c.channel ?? 'sms'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'sequences' && (
        <div>
          {/* Step Builder */}
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>⚡ Multi-Step Sequence Builder</p>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Customers who return after any step are automatically skipped from follow-up sends.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {seqSteps.map((step, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.violet, background: 'rgba(139,92,246,0.12)', padding: '3px 10px', borderRadius: 99 }}>Day {step.delay_days}</span>
                    <select value={step.condition}
                      onChange={e => setSeqSteps(prev => prev.map((s, j) => j === i ? { ...s, condition: e.target.value as 'always' | 'if_not_returned' } : s))}
                      style={{ ...inp, padding: '4px 10px', fontSize: 11, flex: 1, maxWidth: 220 }}>
                      <option value="always">Always send</option>
                      <option value="if_not_returned">Only if not returned</option>
                    </select>
                  </div>
                  <textarea value={step.message} rows={3}
                    placeholder={`Step ${i + 1} SMS message (use {name} for personalisation)…`}
                    onChange={e => setSeqSteps(prev => prev.map((s, j) => j === i ? { ...s, message: e.target.value } : s))}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{step.message.length}/160</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={launchSequence}
                disabled={seqLaunching || selectedCount === 0 || seqSteps.every(s => !s.message.trim())}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: selectedCount > 0 && seqSteps.some(s => s.message.trim()) ? C.violet : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: selectedCount > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: seqLaunching ? 0.6 : 1, transition: 'all 0.2s ease' }}>
                {seqLaunching ? 'Launching…' : `Launch for ${selectedCount} customer${selectedCount !== 1 ? 's' : ''}`}
              </button>
              {seqResult && (
                <div style={{ fontSize: 12, color: C.violet, padding: '8px 14px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8 }}>
                  ✓ Sequence launched: {seqResult.customers} customers × {seqSteps.length} steps = {seqResult.sends_scheduled} sends
                </div>
              )}
            </div>
          </div>

          {/* Sequence history */}
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Sequence History ({sequences.length})</p>
          {sequences.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 32 }}>No sequences yet — build your first above.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sequences.map(s => (
                <div key={s.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{s.name ?? 'Winback Sequence'}</p>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: s.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: s.status === 'active' ? C.green : C.muted }}>{s.status ?? 'active'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4 }}>
                    {([['Customers', s.recipients_count ?? 0], ['Steps', (s.sequence_steps ?? []).length], ['Returned', s.returned_customers ?? 0], ['ROI', (s.roi_percent ?? 0) > 0 ? (s.roi_percent ?? 0) + '%' : '—']] as [string, string | number][]).map(([label, val]) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>{new Date(s.created_at).toLocaleDateString('en-AU')} · {(s.sequence_steps ?? []).length} steps</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'automations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: C.muted }}>Automated sequences triggered by customer behaviour. Toggle on to activate. Use <span style={{ color: C.violet, fontFamily: 'monospace' }}>{'{name}'}</span> for personalisation.</p>
          {automations.map(auto => (
            <div key={auto.trigger_type} style={{ background: C.card, border: '1px solid ' + (auto.is_active ? 'rgba(34,197,94,0.3)' : C.border), borderRadius: 14, padding: 18, transition: 'border-color 0.2s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{auto.label ?? auto.trigger_type}</p>
                  <p style={{ fontSize: 12, color: C.muted }}>{auto.desc ?? ''}</p>
                </div>
                <button onClick={() => toggleAuto(auto)} disabled={savingAuto === auto.trigger_type}
                  style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: auto.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: auto.is_active ? C.green : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease', opacity: savingAuto === auto.trigger_type ? 0.5 : 1 }}>
                  {savingAuto === auto.trigger_type ? '...' : auto.is_active ? '● Active' : 'Off'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>SMS Message</div>
                  <textarea value={auto.sms_message ?? ''} rows={3}
                    onChange={e => setAutomations(prev => prev.map(a => a.trigger_type === auto.trigger_type ? { ...a, sms_message: e.target.value } : a))}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Email Subject</div>
                  <input value={auto.email_subject ?? ''}
                    onChange={e => setAutomations(prev => prev.map(a => a.trigger_type === auto.trigger_type ? { ...a, email_subject: e.target.value } : a))}
                    style={{ ...inp, width: '100%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
