'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type StepStatus = 'pending' | 'running' | 'done' | 'failed'
type ProvStep   = { step: string; label: string; status: StepStatus }

const STEP_ICONS: Record<StepStatus, string> = {
  pending: '○',
  running: '◌',
  done:    '✓',
  failed:  '✗',
}

export default function ProvisioningPage() {
  const router = useRouter()
  const [bizName,  setBizName]  = useState('')
  const [steps,    setSteps]    = useState<ProvStep[]>([])
  const [status,   setStatus]   = useState<'idle' | 'running' | 'complete' | 'failed'>('idle')
  const [errMsg,   setErrMsg]   = useState<string | null>(null)
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const triggered = useRef(false)

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function pollStatus() {
    try {
      const res  = await fetch('/api/onboarding/provision', { cache: 'no-store' })
      const data = await res.json() as {
        provisioning_status: string
        provisioning_steps:  ProvStep[]
        provisioning_error:  string | null
        business_name:       string
      }
      if (data.business_name) setBizName(data.business_name)
      if (Array.isArray(data.provisioning_steps) && data.provisioning_steps.length > 0) {
        setSteps(data.provisioning_steps)
      }
      if (data.provisioning_status === 'complete') {
        stopPoll()
        setStatus('complete')
        setTimeout(() => router.push('/dashboard'), 1200)
      } else if (data.provisioning_status === 'failed') {
        stopPoll()
        setStatus('failed')
        setErrMsg(data.provisioning_error ?? 'Something went wrong. Please retry.')
      }
    } catch { /* silent — keep polling */ }
  }

  async function startProvisioning() {
    triggered.current = true
    setStatus('running')
    setErrMsg(null)

    // Start polling immediately
    pollRef.current = setInterval(pollStatus, 2000)

    // Fire the provision request (long-running — may take up to 60s)
    try {
      const res  = await fetch('/api/onboarding/provision', { method: 'POST', cache: 'no-store' })
      const data = await res.json() as { provisioning_status: string; error?: string }
      if (data.provisioning_status === 'complete') {
        stopPoll()
        setStatus('complete')
        setTimeout(() => router.push('/dashboard'), 1200)
      } else if (data.provisioning_status === 'failed') {
        stopPoll()
        setStatus('failed')
        setErrMsg(data.error ?? 'Something went wrong. Please retry.')
        await pollStatus() // refresh steps display
      }
    } catch {
      stopPoll()
      setStatus('failed')
      setErrMsg('Connection lost. Please retry.')
    }
  }

  useEffect(() => {
    // Fetch initial state to get business name + check if already done
    fetch('/api/onboarding/provision', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { provisioning_status: string; business_name: string; provisioning_steps: ProvStep[] }) => {
        if (data.business_name) setBizName(data.business_name)
        if (Array.isArray(data.provisioning_steps) && data.provisioning_steps.length > 0) {
          setSteps(data.provisioning_steps)
        }
        if (data.provisioning_status === 'complete') {
          setStatus('complete')
          router.push('/dashboard')
        } else if (!triggered.current) {
          startProvisioning()
        }
      })
      .catch(() => { if (!triggered.current) startProvisioning() })
    return () => stopPoll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const displaySteps: ProvStep[] = steps.length > 0 ? steps : [
    { step: 'categories', label: 'Setting up your menu & categories', status: status === 'running' ? 'running' : 'pending' },
    { step: 'hours',      label: 'Configuring your trading hours',    status: 'pending' },
    { step: 'compliance', label: 'Preparing compliance tracking',     status: 'pending' },
    { step: 'briefing',   label: 'Briefing Aria on your business',    status: 'pending' },
    { step: 'finalize',   label: 'Finalising',                        status: 'pending' },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0E1411',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ maxWidth: 480, width: '100%' }}>

        {/* Heading */}
        <h1 style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontStyle: 'italic',
          fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
          fontWeight: 600,
          color: '#E8EDE7',
          marginBottom: '0.5rem',
          lineHeight: 1.2,
        }}>
          {status === 'complete'
            ? 'All done.'
            : status === 'failed'
              ? 'Something went wrong.'
              : bizName
                ? 'Aria is setting up ' + bizName + '.'
                : 'Aria is setting up your business.'}
        </h1>

        <p style={{ color: '#9BA8A0', fontSize: '0.95rem', marginBottom: '2.5rem' }}>
          {status === 'complete'
            ? 'Your dashboard is ready — heading there now.'
            : status === 'failed'
              ? (errMsg ?? 'Something went wrong. Tap retry to try again.')
              : 'This takes about 30 seconds.'}
        </p>

        {/* Step list */}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {displaySteps.map(s => (
            <li key={s.step} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <span style={{
                width: 28, height: 28,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: s.status === 'running' ? '0.7rem' : '0.85rem',
                flexShrink: 0,
                background: s.status === 'done'    ? '#7FB897'
                           : s.status === 'running' ? '#1A2620'
                           : s.status === 'failed'  ? '#4A1C1C'
                           : '#1A2620',
                border: s.status === 'running' ? '2px solid #7FB897'
                       : s.status === 'failed'  ? '2px solid #E05252'
                       : '2px solid #2A3830',
                color: s.status === 'done'    ? '#0E1411'
                      : s.status === 'running' ? '#7FB897'
                      : s.status === 'failed'  ? '#E05252'
                      : '#3A4840',
                animation: s.status === 'running' ? 'aria-pulse 1.2s ease-in-out infinite' : 'none',
              }}>
                {STEP_ICONS[s.status]}
              </span>
              <span style={{
                fontSize: '0.95rem',
                color: s.status === 'done'    ? '#E8EDE7'
                      : s.status === 'running' ? '#E8EDE7'
                      : s.status === 'failed'  ? '#E05252'
                      : '#4A5850',
              }}>
                {s.label}
              </span>
            </li>
          ))}
        </ul>

        {/* Retry button */}
        {status === 'failed' && (
          <button
            onClick={() => startProvisioning()}
            style={{
              marginTop: '2rem',
              background: '#7FB897',
              color: '#0E1411',
              border: 'none',
              borderRadius: 8,
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Retry
          </button>
        )}
      </div>

      <style>{`
        @keyframes aria-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
