'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const STEPS = [
  { id: 'name',    question: "What is the customer's name?" },
  { id: 'group',   question: 'Which group does {name} belong to?' },
  { id: 'code',    question: 'What code would you like to allocate to {name}?' },
  { id: 'contact', question: "What are {name}'s contact details?" },
]

const GRADIENTS = [
  'linear-gradient(135deg, #3d9cb5, #2d8fa8)',
  'linear-gradient(135deg, #3d9cb5, #2d8fa8)',
  'linear-gradient(135deg, #2d4f9e, #1a3a7a)',
  'linear-gradient(135deg, #2d4f9e, #1e3a8a)',
]

const iS: React.CSSProperties = {
  width: '100%', padding: '14px 16px', fontSize: 16,
  background: 'white', color: '#111',
  border: '2px solid rgba(0,0,0,0.2)', borderRadius: 2,
  outline: 'none', boxSizing: 'border-box',
}

export default function NewCustomerPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [data, setData] = useState({ first_name: '', last_name: '', group_id: '', group_name: '', account_code: '', phone: '', email: '', sms_consent: false, email_consent: false })
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [groupOpen, setGroupOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/pos/customer-groups').then(r => r.json())
      .then(d => setGroups(d.groups || d || [])).catch(() => {})
  }, [])

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [step])

  const displayName = data.first_name || 'this customer'
  const question = STEPS[step].question.replace('{name}', displayName)
  const canNext = () => step === 0 ? data.first_name.trim().length > 0 : true

  const next = () => { if (step < STEPS.length - 1) setStep(s => s + 1) }
  const prev = () => { if (step > 0) setStep(s => s - 1) }
  const skip = () => { if (step < STEPS.length - 1) setStep(s => s + 1); else finish() }

  const finish = async () => {
    if (saving) return
    setSaving(true)
    try {
      await fetch('/api/pos/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${data.first_name} ${data.last_name}`.trim(),
          first_name: data.first_name, last_name: data.last_name,
          group_id: data.group_id || null, group_name: data.group_name || null,
          account_number: data.account_code || null,
          phone: data.phone || null, email: data.email || null,
          // CONSENT-COLLECTION-1: express per-channel opt-in (default OFF — never pre-ticked)
          sms_consent: data.sms_consent, email_consent: data.email_consent,
        }),
      })
    } catch (e) { console.error('[silent-catch]', e) }
    router.push('/pos/customers')
  }

  return (
    <div style={{ minHeight: '100vh', background: GRADIENTS[step], display: 'flex', flexDirection: 'column', fontFamily: "'Manrope',system-ui,sans-serif", color: 'white', transition: 'background 400ms ease' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', position: 'relative', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {STEPS.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {i === step && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />}
            </div>
          ))}
        </div>
        <div onClick={() => router.push('/pos/customers')} style={{ position: 'absolute', right: 32, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: 0.85, letterSpacing: '0.02em' }}>× CANCEL</div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 14, opacity: 0.85, letterSpacing: '0.02em', flexShrink: 0 }}>Create Customer</div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', marginTop: -40 }}>
        <div style={{ fontSize: 24, fontWeight: 400, marginBottom: 20, maxWidth: 700, width: '100%' }}>{question}</div>

        {step === 0 && (
          <div style={{ maxWidth: 700, width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input ref={inputRef} type="text" placeholder="First Name (required)" value={data.first_name}
              onChange={e => setData(d => ({ ...d, first_name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && data.first_name.trim()) next() }} style={iS} />
            <input type="text" placeholder="Last Name" value={data.last_name}
              onChange={e => setData(d => ({ ...d, last_name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && data.first_name.trim()) next() }} style={iS} />
          </div>
        )}

        {step === 1 && (
          <div style={{ position: 'relative', maxWidth: 700, width: '100%' }}>
            <div onClick={() => setGroupOpen(o => !o)} style={{ ...iS, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: data.group_name ? '#000' : '#666' }}>
              <span>{data.group_name || 'Select...'}</span>
              <span style={{ fontSize: 12, color: '#666' }}>{groupOpen ? '▲' : '▼'}</span>
            </div>
            {groupOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', zIndex: 50, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxHeight: 300, overflowY: 'auto' }}>
                {groups.map(g => (
                  <div key={g.id} onClick={() => { setData(d => ({ ...d, group_id: g.id, group_name: g.name })); setGroupOpen(false) }}
                    style={{ padding: '14px 16px', color: '#111', cursor: 'pointer', fontSize: 15, borderBottom: '1px solid #f0f0f0' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                    {g.name}
                  </div>
                ))}
                {groups.length === 0 && <div style={{ padding: '14px 16px', color: '#666' }}>No groups yet</div>}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <input ref={inputRef} type="text" placeholder="Code" value={data.account_code}
            onChange={e => setData(d => ({ ...d, account_code: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') next() }} style={iS} />
        )}

        {step === 3 && (
          <div style={{ maxWidth: 700, width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input ref={inputRef} type="tel" placeholder="Phone number" value={data.phone}
              onChange={e => setData(d => ({ ...d, phone: e.target.value }))} style={iS} />
            <input type="email" placeholder="Email address" value={data.email}
              onChange={e => setData(d => ({ ...d, email: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') finish() }} style={iS} />
            {/* CONSENT-COLLECTION-1: explicit opt-in toggles — DEFAULT OFF (un-ticked). A pre-ticked
                box is NOT valid consent under the Spam Act. */}
            <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Marketing — only with the customer&apos;s express OK:</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, cursor: 'pointer' }}>
                <input type="checkbox" checked={data.sms_consent}
                  onChange={e => setData(d => ({ ...d, sms_consent: e.target.checked }))}
                  style={{ width: 18, height: 18 }} />
                Receive offers by SMS?
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, cursor: 'pointer' }}>
                <input type="checkbox" checked={data.email_consent}
                  onChange={e => setData(d => ({ ...d, email_consent: e.target.checked }))}
                  style={{ width: 18, height: 18 }} />
                Receive offers by email?
              </label>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 80px 32px', fontSize: 14, fontWeight: 600, letterSpacing: '0.04em', flexShrink: 0 }}>
        <div onClick={step > 0 ? prev : undefined} style={{ cursor: step > 0 ? 'pointer' : 'default', opacity: step > 0 ? 1 : 0 }}>← PREVIOUS</div>
        <div onClick={skip} style={{ cursor: 'pointer', opacity: 0.85 }}>SKIP</div>
        <div onClick={() => { if (!canNext()) return; step === STEPS.length - 1 ? finish() : next() }}
          style={{ cursor: canNext() ? 'pointer' : 'default', opacity: canNext() ? 1 : 0.4 }}>
          {step === STEPS.length - 1 ? 'FINISH ✓' : 'NEXT →'}
        </div>
      </div>
    </div>
  )
}
