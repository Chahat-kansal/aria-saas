'use client'
import { useEffect, useState, useCallback } from 'react'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface Campaign { id: string; name: string; type: string; channel: string; status: string; sent_count: number; recipients_count: number; scheduled_at: string | null; completed_at: string | null; aria_generated: boolean; target_segment: string | null; message: string; created_at: string; unsubscribe_count?: number; revenue_attributed_cents?: number }
interface Template { id: string; name: string; type: string; channel: string; sms_body: string; is_global: boolean }
interface AriaSuggestion { name: string; type: string; channel: string; target_type: string; target_segment: string | null; message: string; best_send_time: string; rationale: string; predicted_response_rate: number; predicted_revenue_cents: number }
// SegCount retained for type safety in case segCounts is still used elsewhere

const SEGMENTS = ['all','champions','loyal','regular','new','at_risk','hibernating','never_returned','needs_attention']
const SEG_LABELS: Record<string, string> = { all:'All customers', champions:'Champions', loyal:'Loyal', regular:'Regular', new:'New', at_risk:'At risk', hibernating:'Hibernating', never_returned:'Never returned', needs_attention:'Needs attention' }
const STATUS_COLOR: Record<string, string> = { draft:'#888', scheduled:'#378ADD', sending:'#EF9F27', completed:'#1D9E75', pending:'#888', failed:'#E24B4A' }

const VARS = ['{first_name}','{business_name}','{days_since_visit}','{offer}','{google_url}']

function pill(label: string, color: string) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: color + '22', color, letterSpacing: '0.03em' }}>{label}</span>
}

export default function MarketingPage() {
  const [tab, setTab] = useState<'overview'|'create'|'templates'|'analytics'>('overview')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [audienceCounts, setAudienceCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [ariaLoading, setAriaLoading] = useState(false)
  const [ariaSuggestion, setAriaSuggestion] = useState<AriaSuggestion | null>(null)
  const [ariaInsight, setAriaInsight] = useState<string>('')
  const [sending, setSending] = useState(false)

  // Create form state
  const [step, setStep] = useState(1)
  const [formSeg, setFormSeg] = useState('all')
  const [formMsg, setFormMsg] = useState('')
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('promotion')
  const [formSchedule, setFormSchedule] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  // Template form state
  const [tplName, setTplName] = useState(''); const [tplType, setTplType] = useState('promotion'); const [tplBody, setTplBody] = useState(''); const [tplSaving, setTplSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [camRes, tplRes] = await Promise.all([
      fetch('/api/marketing/campaigns').then(r => r.json()),
      fetch('/api/marketing/templates').then(r => r.json()),
    ])
    setCampaigns(camRes.campaigns ?? [])
    setTemplates(tplRes.templates ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/marketing/audience-counts')
      .then(r => r.json())
      .then((d: { counts?: Record<string, number> }) => { if (d.counts) setAudienceCounts(d.counts) })
      .catch(() => {})
  }, [])

  // Aria insight on load
  useEffect(() => {
    if (campaigns.length > 0 && !ariaInsight) {
      const last = campaigns.find(c => c.status === 'completed')
      if (last) setAriaInsight(`Last campaign "${last.name}" reached ${last.sent_count} customers. Consider re-engaging at-risk customers next.`)
    }
  }, [campaigns, ariaInsight])

  const getSegCount = (seg: string) => audienceCounts[seg] ?? 0

  async function handleAriaGenerate() {
    setAriaLoading(true)
    try {
      const r = await fetch('/api/marketing/aria-generate', { method: 'POST' })
      const d = await r.json() as { suggestion?: AriaSuggestion; error?: string }
      if (d.suggestion) {
        setAriaSuggestion(d.suggestion)
        setFormName(d.suggestion.name)
        setFormType(d.suggestion.type)
        setFormSeg(d.suggestion.target_segment ?? 'all')
        setFormMsg(d.suggestion.message)
        if (d.suggestion.best_send_time) setFormSchedule(d.suggestion.best_send_time.slice(0, 16))
        setStep(2)
      } else {
        alert(d.error || 'Aria could not generate a campaign. Make sure customers have marketing consent enabled in their profiles.')
      }
    } finally { setAriaLoading(false) }
  }

  async function handleSend() {
    if (!formMsg.trim() || !formName.trim()) return
    setSending(true)
    try {
      // Create campaign then send
      const createRes = await fetch('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName, type: formType, channel: 'sms',
          target_type: formSeg === 'all' ? 'all' : 'segment',
          target_segment: formSeg === 'all' ? null : formSeg,
          message: formMsg,
          scheduled_at: formSchedule || null,
          aria_generated: !!ariaSuggestion,
          aria_rationale: ariaSuggestion?.rationale ?? null,
        }),
      })
      const { campaign } = await createRes.json() as { campaign?: Campaign }
      if (!campaign) return

      if (!formSchedule) {
        await fetch(`/api/marketing/campaigns/${campaign.id}/send`, { method: 'POST' })
      }
      setStep(1); setFormMsg(''); setFormName(''); setFormSeg('all'); setAriaSuggestion(null); setFormSchedule('')
      setTab('overview')
      await load()
    } finally { setSending(false) }
  }

  async function handleSaveTpl() {
    if (!tplName || !tplBody) return
    setTplSaving(true)
    await fetch('/api/marketing/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tplName, type: tplType, channel: 'sms', sms_body: tplBody }) })
    setTplName(''); setTplType('promotion'); setTplBody(''); setTplSaving(false)
    await load()
  }

  // Stats
  const thisMonth = campaigns.filter(c => c.created_at && new Date(c.created_at as unknown as string) > new Date(Date.now() - 30*24*60*60*1000))
  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0)

  const S: React.CSSProperties = { fontFamily: "'Manrope',sans-serif", color: 'var(--text-primary,#E8EDE7)', background: 'var(--bg-base,#0F1A14)' }

  return (
    <div style={{ ...S, padding: '24px 32px', maxWidth: 900 }}>
      <AriaSays businessId={null} page="marketing" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Marketing</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary,#A8B5A8)' }}>SMS campaigns, automations, and Aria-generated outreach</p>
        </div>
        <button onClick={() => { setTab('create'); setStep(1) }} style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Create Campaign
        </button>
      </div>

      {/* Aria insight panel */}
      {ariaInsight && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(29,158,117,0.07)', border: '1px solid rgba(29,158,117,0.2)', fontSize: 13, color: 'var(--text-secondary,#A8B5A8)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: '#1D9E75', fontWeight: 700 }}>✦ Aria</span>
          {ariaInsight}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 0 }}>
        {(['overview','create','templates','analytics'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: tab === t ? 600 : 400, background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? '#7FB897' : 'var(--text-secondary,#A8B5A8)', borderBottom: tab === t ? '2px solid #7FB897' : '2px solid transparent', textTransform: 'capitalize' }}>
            {t === 'create' ? 'Create' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Campaigns this month', value: String(thisMonth.length) },
              { label: 'Total SMS sent', value: totalSent.toLocaleString() },
              { label: 'Completed campaigns', value: String(campaigns.filter(c => c.status === 'completed').length) },
              { label: 'Active automations', value: '2' },
            ].map((card, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated,#1A2620)', borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(232,237,231,0.07)' }}>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{card.label}</p>
                <p style={{ fontSize: 24, fontWeight: 600 }}>{loading ? '—' : card.value}</p>
              </div>
            ))}
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Recent campaigns</h2>
          {loading && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</p>}
          {!loading && campaigns.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No campaigns yet. Create your first one.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {campaigns.slice(0, 10).map(c => (
              <div key={c.id} style={{ background: 'var(--bg-elevated,#1A2620)', borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(232,237,231,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                  {c.aria_generated && <span style={{ marginLeft: 8, fontSize: 10, color: '#1D9E75', fontWeight: 600 }}>✦ Aria</span>}
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{c.target_segment ? SEG_LABELS[c.target_segment] ?? c.target_segment : 'All customers'} · {c.channel?.toUpperCase()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {pill(c.status, STATUS_COLOR[c.status] ?? '#888')}
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{c.sent_count ?? 0} sent</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CREATE CAMPAIGN */}
      {tab === 'create' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[1,2,3].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: step >= s ? '#1D9E75' : 'rgba(255,255,255,0.08)', color: step >= s ? '#fff' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s}</div>
                <span style={{ fontSize: 12, color: step >= s ? '#7FB897' : 'var(--text-secondary)' }}>{s===1?'Audience':s===2?'Message':'Review'}</span>
                {s < 3 && <span style={{ color: 'rgba(255,255,255,0.15)' }}>›</span>}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Who should receive this campaign?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {SEGMENTS.map(seg => (
                  <button key={seg} onClick={() => setFormSeg(seg)}
                    style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: formSeg === seg ? 600 : 400, background: formSeg === seg ? '#2D5240' : 'rgba(255,255,255,0.04)', color: formSeg === seg ? '#7FB897' : 'var(--text-secondary)', border: '1px solid ' + (formSeg === seg ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.08)'), cursor: 'pointer' }}>
                    {SEG_LABELS[seg]} ({getSegCount(seg)})
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleAriaGenerate} disabled={ariaLoading}
                  style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.25)', cursor: 'pointer' }}>
                  {ariaLoading ? '✦ Generating…' : '✦ Let Aria choose'}
                </button>
                <button onClick={() => setStep(2)}
                  style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#1D9E75', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Continue →
                </button>
              </div>
              {ariaSuggestion && (
                <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.15)', fontSize: 13 }}>
                  <p style={{ fontWeight: 600, color: '#7FB897', marginBottom: 4 }}>✦ Aria suggests: {ariaSuggestion.name}</p>
                  <p style={{ color: 'var(--text-secondary)' }}>{ariaSuggestion.rationale}</p>
                  <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Predicted response: {Math.round((ariaSuggestion.predicted_response_rate ?? 0) * 100)}% · ~${((ariaSuggestion.predicted_revenue_cents ?? 0)/100).toFixed(0)} revenue</p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Campaign name</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Weekend winback blast"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Pick a template</label>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {templates.map(t => (
                    <div key={t.id} onClick={() => { setSelectedTemplate(t.id); setFormMsg(t.sms_body ?? '') }}
                      style={{ flexShrink: 0, width: 160, padding: '10px 12px', borderRadius: 8, background: selectedTemplate === t.id ? '#2D5240' : 'var(--bg-elevated)', border: '1px solid ' + (selectedTemplate === t.id ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.07)'), cursor: 'pointer' }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: selectedTemplate === t.id ? '#7FB897' : 'var(--text-secondary)', marginBottom: 4 }}>{t.type?.toUpperCase()}{t.is_global && ' · Aria'}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-primary)' }}>{t.name}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>SMS message <span style={{ color: formMsg.length > 160 ? '#E24B4A' : 'var(--text-secondary)' }}>({formMsg.length}/160)</span></label>
                <textarea value={formMsg} onChange={e => setFormMsg(e.target.value)} rows={4}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid ' + (formMsg.length > 160 ? 'rgba(226,75,74,0.5)' : 'rgba(255,255,255,0.1)'), color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {VARS.map(v => (
                  <button key={v} onClick={() => setFormMsg(m => m + v)}
                    style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: 'rgba(127,184,151,0.08)', color: '#7FB897', border: '1px solid rgba(127,184,151,0.2)', cursor: 'pointer' }}>
                    {v}
                  </button>
                ))}
              </div>
              {formMsg && (
                <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Preview:</span> {formMsg.replace('{first_name}', 'Alex').replace('{business_name}', 'Your store').replace('{days_since_visit}', '14').replace('{offer}', '$10 off')}
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Schedule (optional — leave blank to send now)</label>
                <input type="datetime-local" value={formSchedule} onChange={e => setFormSchedule(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep(1)} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>← Back</button>
                <button onClick={() => setStep(3)} disabled={!formMsg.trim() || !formName.trim()} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#1D9E75', color: '#fff', border: 'none', cursor: 'pointer', opacity: (!formMsg.trim() || !formName.trim()) ? 0.5 : 1 }}>Review →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid rgba(127,184,151,0.15)', marginBottom: 20 }}>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Campaign summary</p>
                {[
                  ['Name', formName],
                  ['Audience', `${SEG_LABELS[formSeg] ?? formSeg} — ${getSegCount(formSeg)} eligible customers`],
                  ['Message', formMsg],
                  ['Send', formSchedule ? `Scheduled: ${new Date(formSchedule).toLocaleString('en-AU')}` : 'Immediately after confirmation'],
                  ['Est. cost', `$${(getSegCount(formSeg) * 0.075).toFixed(2)} (~$0.075/SMS)`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)', width: 100, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{v}</span>
                  </div>
                ))}
                {ariaSuggestion && (
                  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.15)', fontSize: 12, color: 'var(--text-secondary)' }}>
                    ✦ Aria prediction: ~{Math.round((ariaSuggestion.predicted_response_rate ?? 0)*100)}% response · ~${((ariaSuggestion.predicted_revenue_cents??0)/100).toFixed(0)} revenue
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep(2)} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>← Edit</button>
                <button onClick={handleSend} disabled={sending}
                  style={{ padding: '9px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, background: '#1D9E75', color: '#fff', border: 'none', cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.6 : 1 }}>
                  {sending ? 'Sending…' : formSchedule ? 'Schedule campaign' : `Send to ${getSegCount(formSeg)} customers`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TEMPLATES */}
      {tab === 'templates' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 28 }}>
            {templates.map(t => (
              <div key={t.id} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</p>
                  {t.is_global && <span style={{ fontSize: 10, color: '#1D9E75', fontWeight: 600 }}>✦ Default</span>}
                </div>
                {pill(t.type, '#378ADD')}
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>{(t.sms_body ?? '').slice(0, 100)}{(t.sms_body ?? '').length > 100 ? '…' : ''}</p>
                <button onClick={() => { setFormMsg(t.sms_body ?? ''); setSelectedTemplate(t.id); setTab('create'); setStep(2) }}
                  style={{ marginTop: 10, width: '100%', padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, background: '#2D5240', color: '#7FB897', border: '1px solid rgba(127,184,151,0.2)', cursor: 'pointer' }}>
                  Use this
                </button>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Create custom template</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Template name"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
              <select value={tplType} onChange={e => setTplType(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
                {['promotion','winback','birthday','loyalty','announcement'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <textarea value={tplBody} onChange={e => setTplBody(e.target.value)} rows={3} placeholder="SMS body — use {first_name}, {business_name}, {offer}"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={handleSaveTpl} disabled={tplSaving || !tplName || !tplBody}
              style={{ marginTop: 10, padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#1D9E75', color: '#fff', border: 'none', cursor: 'pointer', opacity: (!tplName || !tplBody) ? 0.5 : 1 }}>
              {tplSaving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>
      )}

      {/* ANALYTICS */}
      {tab === 'analytics' && (
        <div>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total sent', value: campaigns.reduce((s,c) => s+(c.sent_count??0), 0).toLocaleString() },
              { label: 'Total recipients', value: campaigns.reduce((s,c) => s+(c.recipients_count??0), 0).toLocaleString() },
              { label: 'Campaigns run', value: campaigns.filter(c=>c.status==='completed').length },
              { label: 'Unsubscribes', value: campaigns.reduce((s,c) => s+((c.unsubscribe_count)??0), 0) },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: '#7FB897' }}>{value}</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</p>
              </div>
            ))}
          </div>

          {loading && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {campaigns.filter(c => c.status === 'completed' || c.status === 'sending').map(c => {
              const deliveryRate = c.recipients_count ? Math.round((c.sent_count / c.recipients_count) * 100) : 0
              const unsubRate = c.sent_count ? Math.round((c.unsubscribe_count ?? 0) / c.sent_count * 100) : 0
              const revenue = (c.revenue_attributed_cents ?? 0) / 100
              return (
                <div key={c.id} style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {c.target_segment ? SEG_LABELS[c.target_segment] ?? c.target_segment : 'All customers'} · {c.completed_at ? new Date(c.completed_at).toLocaleDateString('en-AU') : '—'}
                        {c.aria_generated && <span style={{ marginLeft: 6, color: '#7FB897', fontSize: 11 }}>✦ Aria</span>}
                      </p>
                    </div>
                    <div>{pill(c.status, STATUS_COLOR[c.status] ?? '#888')}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
                    {[
                      { label: 'Sent', value: c.sent_count ?? 0, color: 'var(--text-primary)' },
                      { label: 'Delivery', value: `${deliveryRate}%`, color: deliveryRate >= 90 ? '#7FB897' : deliveryRate >= 70 ? '#f59e0b' : '#ef4444' },
                      { label: 'Recipients', value: c.recipients_count ?? 0, color: 'var(--text-primary)' },
                      { label: 'Opt-outs', value: c.unsubscribe_count ?? 0, color: unsubRate > 2 ? '#ef4444' : 'var(--text-primary)' },
                      { label: 'Revenue', value: revenue > 0 ? `$${revenue.toFixed(0)}` : '—', color: revenue > 0 ? '#7FB897' : 'var(--text-secondary)' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color }}>{value}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</p>
                      </div>
                    ))}
                  </div>
                  {c.message && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontStyle: 'italic' }}>"{c.message.slice(0,120)}{c.message.length>120?'…':''}"</p>}
                </div>
              )
            })}
            {!loading && campaigns.filter(c => ['completed','sending'].includes(c.status)).length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
                <p>No completed campaigns yet.</p>
                <p style={{ marginTop: 8, fontSize: 12 }}>Send your first campaign to see analytics here.</p>
              </div>
            )}
          </div>

          {/* Opt-out compliance note */}
          <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(127,184,151,0.06)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid rgba(127,184,151,0.15)' }}>
            <strong style={{ color: '#7FB897' }}>Opt-out handling:</strong> All campaigns include "Reply STOP to unsubscribe". Opt-outs are automatically recorded and those customers are excluded from future campaigns. Australian Spam Act compliant.
          </div>
        </div>
      )}
    </div>
  )
}
