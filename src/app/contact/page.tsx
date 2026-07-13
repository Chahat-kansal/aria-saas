'use client'
import { useState } from 'react'
import TurnstileWidget from '@/components/security/TurnstileWidget'

export default function ContactPage() {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [message, setMessage] = useState('')
  const [status,  setStatus]  = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [turnstileToken, setTurnstileToken] = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, padding: '10px 14px',
    color: '#fff', fontSize: 14, outline: 'none',
    fontFamily: 'inherit',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, turnstile_token: turnstileToken }),
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#090e0b',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: "'Inter',sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{ fontSize: 13, letterSpacing: '0.2em', color: '#7FB897', textTransform: 'uppercase', margin: '0 0 12px' }}>
            Aria OS
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#fff', margin: '0 0 8px', fontFamily: "'Fraunces',serif" }}>
            Get in touch
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            Questions, feedback, or partnership enquiries —{' '}
            <a href="mailto:hello@ariaos.site" style={{ color: '#7FB897', textDecoration: 'none' }}>
              hello@ariaos.site
            </a>
          </p>
        </div>

        {status === 'sent' ? (
          <div style={{
            background: 'rgba(127,184,151,0.12)', border: '1px solid rgba(127,184,151,0.3)',
            borderRadius: 12, padding: 32, textAlign: 'center',
          }}>
            <p style={{ fontSize: 28, margin: '0 0 8px' }}>✓</p>
            <p style={{ color: '#7FB897', fontWeight: 700, margin: '0 0 4px' }}>Message sent</p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: 0 }}>
              We'll get back to you at {email}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}
            style={{ background: '#111a14', border: '1px solid rgba(127,184,151,0.15)', borderRadius: 16, padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name" required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Message</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                placeholder="How can we help?" required rows={5}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            {status === 'error' && (
              <p style={{ color: '#EF4444', fontSize: 13, margin: 0 }}>
                Something went wrong — please email us directly at hello@ariaos.site
              </p>
            )}

            <TurnstileWidget onToken={setTurnstileToken} theme="dark" />

            <button type="submit" disabled={status === 'sending'}
              style={{
                padding: '12px 0', borderRadius: 8, border: 'none',
                background: status === 'sending' ? 'rgba(127,184,151,0.4)' : '#7FB897',
                color: '#fff', fontWeight: 700, fontSize: 15, cursor: status === 'sending' ? 'default' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
              }}>
              {status === 'sending' ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
          © {new Date().getFullYear()} Aria OS · ariaos.site
        </p>
      </div>
    </div>
  )
}