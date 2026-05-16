'use client'
import { useState, useEffect } from 'react'

interface EmailLog { id: string; recipient: string; subject: string | null; email_type: string | null; status: string; sent_at: string }

const STATUS_COLOR: Record<string, string> = { sent: '#22c55e', failed: '#ef4444', bounced: '#f97316', queued: '#f59e0b' }

export default function MailLogPage() {
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pos/email-log').then(r => r.json()).then(d => { setLogs(d.logs ?? []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Mail Log</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>History of emails sent from Aria — receipts, marketing, system notifications.</p>

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📧</div>
          <p style={{ margin: 0 }}>No emails logged yet.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Emails sent from Aria (receipts, winback campaigns, etc.) will appear here.</p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-surface)' }}>
              {['Sent', 'Recipient', 'Subject', 'Type', 'Status'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--divider)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(l.sent_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '10px 14px' }}>{l.recipient}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{l.subject ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)' }}>{l.email_type ?? '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: `${STATUS_COLOR[l.status] ?? '#94a3b8'}18`, color: STATUS_COLOR[l.status] ?? '#94a3b8', fontWeight: 700 }}>{l.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}