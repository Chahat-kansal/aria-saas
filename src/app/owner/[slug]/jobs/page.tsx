'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOwnerBusiness } from '../OwnerBusinessContext'
import { INK, SUBTEXT, BORDER, FONT_MONO } from '@/app/owner/theme'
import { formatSchedule, type OwnerJob } from '@/lib/owner-app/jobs'

const EXAMPLE_ASKS = [
  'Chase the four unpaid catering invoices',
  'Rebuild next month\'s promo calendar',
  'Compare my top 3 suppliers on price',
]

function elapsed(startedAt: string | null): string {
  if (!startedAt) return ''
  const ms = Date.now() - new Date(startedAt).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just started'
  if (mins < 60) return mins + ' min'
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
}

function RunningJobCard({ job }: { job: OwnerJob }) {
  return (
    <div style={{ background: '#fff', border: '1px solid ' + BORDER, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>{job.title}</div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: SUBTEXT, whiteSpace: 'nowrap' }}>{elapsed(job.started_at)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        {job.steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.state === 'pending' ? SUBTEXT : INK }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: s.state === 'done' ? '#d9f54e' : s.state === 'failed' ? '#b91c1c' : s.state === 'active' ? INK : BORDER,
              animation: s.state === 'active' ? 'owner-pulse 1.4s ease-in-out infinite' : undefined,
            }} />
            {s.label}
          </div>
        ))}
      </div>
      {job.status !== 'failed' && (
        <div style={{ marginTop: 12, fontSize: 12, color: SUBTEXT, fontStyle: 'italic' }}>
          You can close the app — this keeps running on the server.
        </div>
      )}
      {job.status === 'failed' && job.error_message && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#b91c1c' }}>{job.error_message}</div>
      )}
      <style>{'@keyframes owner-pulse { 0%,100% { opacity:1 } 50% { opacity:0.35 } }'}</style>
    </div>
  )
}

export default function OwnerJobsPage() {
  const business = useOwnerBusiness()
  const router = useRouter()
  const [running, setRunning] = useState<OwnerJob[]>([])
  const [doneToday, setDoneToday] = useState<OwnerJob[]>([])
  const [standing, setStanding] = useState<OwnerJob[]>([])
  const [ask, setAsk] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const runningRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/owner/jobs?business_id=' + business.id)
    if (res.ok) {
      const json = await res.json()
      setRunning(json.running); setDoneToday(json.done_today); setStanding(json.standing)
    }
    setLoaded(true)
  }, [business.id])

  useEffect(() => { load() }, [load])

  // Poll while anything is actually in-flight — real states only, stop polling once nothing's running.
  useEffect(() => {
    if (running.length === 0) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [running.length, load])

  async function submitAsk() {
    if (!ask.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/owner/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, ask }),
      })
      if (res.ok) {
        setAsk('')
        await load()
        runningRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStanding(job: OwnerJob) {
    setStanding(prev => prev.map(j => j.id === job.id ? { ...j, enabled: !j.enabled } : j))
    await fetch('/api/owner/jobs/' + job.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, enabled: !job.enabled }),
    })
  }

  async function openDeliverable(job: OwnerJob) {
    const res = await fetch('/api/owner/jobs/' + job.id + '?business_id=' + business.id)
    if (!res.ok) return
    const { produced_decisions } = await res.json()
    if (produced_decisions?.length > 0) {
      router.push('/owner/' + business.slug + '/decisions')
    } else if (job.output_id) {
      window.open('/dashboard/reports/' + job.output_id, '_blank')
    }
  }

  return (
    <div style={{ padding: '20px 20px 24px' }}>
      <div style={{ fontWeight: 700, fontSize: 26, color: INK }}>Jobs</div>
      <div style={{ fontSize: 14, color: SUBTEXT, marginTop: 4, lineHeight: 1.5 }}>
        Work you hand to Aria. It runs on the server — lock your phone, close the app, it keeps going.
      </div>

      {loaded && running.length === 0 && doneToday.length === 0 && (
        <div style={{ marginTop: 20, padding: 20, textAlign: 'center', color: SUBTEXT, fontSize: 13, border: '1px dashed ' + BORDER, borderRadius: 12 }}>
          Nothing running right now.
        </div>
      )}

      {running.length > 0 && (
        <div ref={runningRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {running.map(j => <RunningJobCard key={j.id} job={j} />)}
        </div>
      )}

      {doneToday.length > 0 && (
        <>
          <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: SUBTEXT, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 24, marginBottom: 10 }}>
            Done today
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {doneToday.map(j => (
              <button key={j.id} onClick={() => openDeliverable(j)}
                style={{ textAlign: 'left', background: '#fff', border: '1px solid ' + BORDER, borderRadius: 12, padding: 16, cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>{j.title}</div>
                <div style={{ fontSize: 12, color: j.status === 'failed' ? '#b91c1c' : SUBTEXT, marginTop: 4 }}>
                  {j.status === 'failed' ? 'Failed — ' + (j.error_message ?? 'see details') : 'Open it here or at the counter — same session.'}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: SUBTEXT, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 28, marginBottom: 10 }}>
        Standing jobs
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {standing.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: SUBTEXT, fontSize: 13, border: '1px dashed ' + BORDER, borderRadius: 12 }}>
            No standing jobs set up yet.
          </div>
        )}
        {standing.map(j => (
          <div key={j.id} style={{ background: '#fff', border: '1px solid ' + BORDER, borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: INK }}>{j.title}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: SUBTEXT, marginTop: 4, letterSpacing: '0.02em' }}>
                {formatSchedule(j.schedule).toUpperCase()} · RUNS WITH NO DEVICE ON
              </div>
            </div>
            <button
              onClick={() => toggleStanding(j)}
              aria-label={j.enabled ? 'Disable standing job' : 'Enable standing job'}
              style={{
                flexShrink: 0, width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
                background: j.enabled ? '#d9f54e' : BORDER, position: 'relative',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: j.enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%',
                background: '#fff', transition: 'left 0.15s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: SUBTEXT, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 28, marginBottom: 10 }}>
        Hand over something new
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {EXAMPLE_ASKS.map(ex => (
          <button
            key={ex}
            onClick={() => setAsk(ex)}
            style={{ textAlign: 'left', background: 'transparent', border: '1px dashed ' + BORDER, borderRadius: 12, padding: 14, fontSize: 14, color: INK, cursor: 'pointer' }}
          >
            {ex}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <input
            value={ask}
            onChange={e => setAsk(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitAsk() }}
            placeholder="Tell Aria what to work on…"
            style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: '1px solid ' + BORDER, fontSize: 14, boxSizing: 'border-box' }}
          />
          <button
            disabled={!ask.trim() || submitting}
            onClick={submitAsk}
            style={{ padding: '0 20px', borderRadius: 12, border: 'none', background: INK, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: !ask.trim() || submitting ? 0.5 : 1 }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
