'use client'
import { useState } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { useRouter } from 'next/navigation'
import { SEGMENT_COLORS, SEGMENT_ORDER } from '@/lib/customer-segments'
import { WINBACK_TEMPLATES } from '@/lib/winback-templates'

const STEPS = ['Choose segment', 'Compose message', 'Review & send']

export default function WinbackNewPage() {
  const { business } = useBusinessContext()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [segment, setSegment] = useState('at_risk')
  const [channel, setChannel] = useState<'sms' | 'email'>('sms')
  const [message, setMessage] = useState(WINBACK_TEMPLATES['at_risk'].sms)
  const [sendNow, setSendNow] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [result, setResult] = useState<{ sent_count: number; recipients_count: number } | null>(null)
  const [error, setError] = useState('')

  const handleSegmentChange = (seg: string) => {
    setSegment(seg)
    const t = WINBACK_TEMPLATES[seg]
    if (t) setMessage(channel === 'sms' ? t.sms : t.email_body)
  }

  const handleChannelChange = (ch: 'sms' | 'email') => {
    setChannel(ch)
    const t = WINBACK_TEMPLATES[segment]
    if (t) setMessage(ch === 'sms' ? t.sms : t.email_body)
  }

  const launch = async () => {
    if (!business?.id) return
    setLaunching(true); setError('')
    const r = await fetch('/api/customers/winback/launch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, target_segment: segment, channel, message_template: message, send_now: sendNow }),
    })
    const j = await r.json() as { ok?: boolean; sent_count?: number; recipients_count?: number; error?: string }
    if (r.ok && j.ok) { setResult({ sent_count: j.sent_count ?? 0, recipients_count: j.recipients_count ?? 0 }) }
    else setError(j.error ?? 'Launch failed')
    setLaunching(false)
  }

  if (result) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-4" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
        <div className="text-4xl">✓</div>
        <h2 className="text-xl font-medium">Campaign launched</h2>
        <p style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Sent to {result.sent_count} of {result.recipients_count} eligible customers.
        </p>
        <button onClick={() => router.push('/dashboard/customers')} className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#2D5240', color: '#7FB897' }}>Back to customers</button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <h1 className="text-2xl font-medium">Send winback campaign</h1>

      {/* Step indicator */}
      <div className="flex gap-2 items-center">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${i <= step ? 'bg-[#2D5240] text-[#7FB897]' : 'bg-white/10 text-white/40'}`}>{i + 1}</div>
            <span className="text-sm" style={{ color: i === step ? 'var(--text-primary)' : 'var(--text-secondary, #A8B5A8)' }}>{s}</span>
            {i < STEPS.length - 1 && <span className="text-white/20 mx-1">→</span>}
          </div>
        ))}
      </div>

      {/* Step 0 — Choose segment */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Which customer segment do you want to reach?</p>
          <div className="grid grid-cols-2 gap-3">
            {SEGMENT_ORDER.filter(s => WINBACK_TEMPLATES[s]).map(seg => {
              const c = SEGMENT_COLORS[seg]
              return (
                <button key={seg} onClick={() => handleSegmentChange(seg)}
                  className={`px-4 py-3 rounded-xl text-left transition-colors ${segment === seg ? 'ring-2 ring-[#7FB897]' : ''}`}
                  style={{ background: c.bg, border: `1px solid ${segment === seg ? '#7FB897' : 'transparent'}` }}>
                  <p className="text-sm font-medium" style={{ color: c.text }}>{c.label}</p>
                </button>
              )
            })}
          </div>
          <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: '#2D5240', color: '#7FB897' }}>
            Next →
          </button>
        </div>
      )}

      {/* Step 1 — Compose */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['sms', 'email'] as const).map(ch => (
              <button key={ch} onClick={() => handleChannelChange(ch)}
                className={`px-3 py-1.5 rounded-lg text-sm uppercase font-medium ${channel === ch ? 'bg-[#2D5240] text-[#7FB897]' : 'bg-white/05 text-white/50'}`}>
                {ch}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Message (use {'{first_name}'}, {'{days_since_visit}'}, {'{business_name}'})</label>
            <textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(0)} className="px-4 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary)' }}>← Back</button>
            <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: '#2D5240', color: '#7FB897' }}>Review →</button>
          </div>
        </div>
      )}

      {/* Step 2 — Review */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Segment</span><span>{SEGMENT_COLORS[segment]?.label}</span></div>
            <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Channel</span><span className="uppercase">{channel}</span></div>
            <div className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Message preview:</div>
            <p className="text-sm p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)' }}>{message}</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={sendNow} onChange={e => setSendNow(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">Send immediately</span>
          </label>
          {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
          <div className="flex gap-4">
            <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary)' }}>← Back</button>
            <button onClick={launch} disabled={launching} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: '#2D5240', color: '#7FB897' }}>
              {launching ? 'Launching…' : sendNow ? 'Send now' : 'Schedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
