'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface ReportRecord {
  id: string
  week_start: string
  week_end: string
  pdf_url: string | null
  email_sent: boolean
  email_sent_at: string | null
  suspicious_count: number
  total_revenue: number | null
  created_at: string
}

function fmtAud(n: number | null) {
  if (n == null) return '—'
  return 'A$' + (Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtWeek(start: string, end: string) {
  const s = new Date(start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const e = new Date(end).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return s + ' – ' + e
}

const STEPS = ['Gathering sales data…', 'Running Aria Council analysis…', 'Generating promo recommendations…', 'Rendering PDF…', 'Uploading & sending email…']

export default function WeeklyReportsPage() {
  const { business } = useBusinessContext()
  const [records, setRecords] = useState<ReportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [result, setResult] = useState<{ pdf_url: string; email_sent: boolean; email: string | null } | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  const loadRecords = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const res = await fetch('/api/reports/weekly-records?business_id=' + business.id)
      .then(r => r.json()).catch(() => ({ records: [] }))
    setRecords(res.records ?? [])
    setLoading(false)
  }, [business?.id])

  useEffect(() => { loadRecords() }, [loadRecords])

  useEffect(() => {
    if (!generating) return
    const timer = setInterval(() => setStepIdx(i => (i + 1) % STEPS.length), 3500)
    return () => clearInterval(timer)
  }, [generating])

  async function generate() {
    if (!business?.id) return
    setGenerating(true)
    setStepIdx(0)
    setResult(null)
    setGenError(null)
    try {
      const res = await fetch('/api/reports/weekly-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      }).then(r => r.json())
      if (res.error) { setGenError(res.error); return }
      setResult({ pdf_url: res.pdf_url, email_sent: res.email_sent, email: res.email })
      loadRecords()
    } catch { setGenError('Network error — please try again.') }
    finally { setGenerating(false) }
  }

  const accentForest = '#2D5240'
  const accentSage = '#7FB897'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Weekly Reports</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>AI-generated every Monday at 8 AM AEST. Sent directly to your email with a PDF attachment.</p>
        </div>
        <button
          onClick={generate}
          disabled={generating || !business?.id}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 shrink-0"
          style={{ background: accentForest }}>
          {generating ? '…' : '✦ Generate this week\'s report'}
        </button>
      </div>

      {/* Generation progress */}
      {generating && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: 'rgba(45,82,64,0.12)', border: '1px solid rgba(127,184,151,0.25)' }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-block w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: accentSage, borderTopColor: 'transparent' }} />
            <span className="text-sm font-medium" style={{ color: accentSage }}>Aria is generating your report…</span>
          </div>
          <div className="space-y-2">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2 text-xs" style={{ color: i <= stepIdx ? '#d1d5db' : '#4b5563' }}>
                <span className="w-4">{i < stepIdx ? '✓' : i === stepIdx ? '›' : '○'}</span>
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generation result */}
      {result && !generating && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: 'rgba(45,82,64,0.1)', border: '1px solid rgba(127,184,151,0.3)' }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-white mb-1">Report ready</p>
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                {result.email_sent
                  ? 'Sent to ' + (result.email ?? 'your email') + ' with PDF attached.'
                  : 'Generated successfully. Email not configured or failed — download below.'}
              </p>
            </div>
            {result.pdf_url && (
              <a href={result.pdf_url} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white shrink-0 no-underline"
                style={{ background: accentForest }}>
                Download PDF
              </a>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {genError && (
        <div className="rounded-xl px-4 py-3 mb-6 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {genError}
        </div>
      )}

      {/* History */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>Report history</p>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl p-12 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-4xl mb-4">📊</div>
            <p className="font-semibold text-white mb-2">No reports yet</p>
            <p className="text-sm max-w-sm mx-auto mb-6" style={{ color: '#6b7280' }}>
              Your weekly report is generated automatically every Monday morning at 8 AM AEST and emailed to you with a PDF attached. You can also generate one manually above.
            </p>
            <button onClick={generate} disabled={generating}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: accentForest }}>
              Generate first report
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map(r => (
              <div key={r.id} className="rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{fmtWeek(r.week_start, r.week_end)}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs" style={{ color: accentSage }}>{fmtAud(r.total_revenue)}</span>
                    {r.suspicious_count > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                        {r.suspicious_count} flag{r.suspicious_count > 1 ? 's' : ''}
                      </span>
                    )}
                    {r.email_sent ? (
                      <span className="text-xs" style={{ color: '#4b5563' }}>
                        Sent {r.email_sent_at ? new Date(r.email_sent_at).toLocaleDateString('en-AU') : ''}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: '#4b5563' }}>Email not sent</span>
                    )}
                  </div>
                </div>
                {r.pdf_url && (
                  <a href={r.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg font-medium no-underline shrink-0"
                    style={{ background: 'rgba(45,82,64,0.3)', color: accentSage, border: '1px solid rgba(127,184,151,0.2)' }}>
                    Download PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
