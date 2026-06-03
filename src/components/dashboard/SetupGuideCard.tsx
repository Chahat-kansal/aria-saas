'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface SetupProgress {
  business_id: string
  completed_tasks: string[]
  dismissed: boolean
  all_tasks: string[]
}

const TASKS: Array<{
  key: string
  label: string
  description: string
  href: string
  guideParam?: string
}> = [
  { key: 'add_product',     label: 'Add your first product',    description: 'Add at least one product to your POS',    href: '/pos/products',          guideParam: 'add_product' },
  { key: 'test_sale',       label: 'Complete a test sale',       description: 'Run a sale through the POS terminal',     href: '/pos/terminal',          guideParam: 'test_sale' },
  { key: 'set_hours',       label: 'Set your trading hours',     description: 'Let customers know when you\'re open',    href: '/dashboard/settings',    guideParam: 'set_hours' },
  { key: 'invite_staff',    label: 'Invite a staff member',      description: 'Add your team so they can use the POS',   href: '/dashboard/staff',       guideParam: 'invite_staff' },
  { key: 'connect_google',  label: 'Connect Google Business',    description: 'Sync your reviews and business profile',  href: '/dashboard/settings',    guideParam: 'connect_google' },
]

export function SetupGuideCard({ businessId }: { businessId: string }) {
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/setup/progress')
      if (res.ok) setProgress(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading || !progress) return null
  if (progress.dismissed) return null

  const completed = progress.completed_tasks ?? []
  const total = TASKS.length
  const done = TASKS.filter(t => completed.includes(t.key)).length

  if (done >= total) return null

  const pct = Math.round((done / total) * 100)

  async function dismiss() {
    setDismissing(true)
    await fetch('/api/setup/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissed: true }),
    })
    setProgress(prev => prev ? { ...prev, dismissed: true } : null)
    setDismissing(false)
  }

  return (
    <div style={{ borderRadius: 16, background: 'rgba(45,82,64,0.12)', border: '1px solid rgba(127,184,151,0.2)', marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(127,184,151,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🚀</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Get started with Aria</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>{done} of {total} tasks complete</div>
            </div>
          </div>
          <button onClick={dismiss} disabled={dismissing}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 18, cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pct + '%', background: 'linear-gradient(90deg, #2D5240, #7FB897)', borderRadius: 4, transition: 'width 0.4s ease' }} />
        </div>
      </div>
      <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {TASKS.map(task => {
          const isDone = completed.includes(task.key)
          return (
            <div key={task.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: isDone ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (isDone ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)') }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: isDone ? '#22c55e' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isDone && <span style={{ fontSize: 11, color: '#fff' }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: isDone ? 400 : 600, color: isDone ? 'rgba(255,255,255,0.4)' : '#fff', textDecoration: isDone ? 'line-through' : 'none' }}>{task.label}</div>
                  {!isDone && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{task.description}</div>}
                </div>
              </div>
              {!isDone && (
                <Link
                  href={task.href + (task.guideParam ? '?guide=' + task.guideParam : '')}
                  style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
                  Do it →
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
