'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { supabase } from '@/lib/supabase'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface SeoAudit { id: string; status: string; pages_crawled: number; issues_found: number; issues_fixed: number; health_score: number; started_at: string; finished_at: string | null }
interface SeoIssue { id: string; page_url: string; issue_type: string; severity: string; title: string; detail: string; suggested_fix: string | null; fix_format: string | null; state: string }
interface SeoLocal { gbp_completeness: number | null; gbp_listed?: boolean | null; review_count?: number | null; review_avg?: number | null; map_pack_rank: number | null; citations_total: number | null; citations_consistent: number | null; review_velocity_30d: number | null; checklist: Array<{ item: string; ok: boolean }> | null }
interface SeoKeyword { id: string; keyword: string; current_rank: number | null; previous_rank: number | null; search_volume: number | null }
interface SeoPage { url: string; title: string | null }

// ── Shared helpers ─────────────────────────────────────────────────────────

function RingChart({ score }: { score: number }) {
  const r = 38; const c = 2 * Math.PI * r; const pct = Math.max(0, Math.min(100, score))
  const dash = (pct / 100) * c
  const col = pct >= 80 ? '#7FB897' : pct >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={96} height={96} viewBox="0 0 96 96">
      <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
      <circle cx={48} cy={48} r={r} fill="none" stroke={col} strokeWidth={10} strokeDasharray={dash + ' ' + c} strokeLinecap="round" transform="rotate(-90 48 48)" />
      <text x={48} y={54} textAnchor="middle" fill="#fff" fontSize={20} fontWeight={700}>{pct}</text>
    </svg>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
  return (
    <button onClick={copy} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(127,184,151,0.4)', background: 'transparent', color: '#7FB897', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── Tab 1: Site Health ─────────────────────────────────────────────────────

function SiteHealthTab({ businessId }: { businessId: string }) {
  const [audit, setAudit] = useState<SeoAudit | null>(null)
  const [issues, setIssues] = useState<SeoIssue[]>([])
  const [pages, setPages] = useState<SeoPage[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [crawling, setCrawling] = useState(false)
  const [fixingId, setFixingId] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ health_score: number; finished_at: string }>>([])
  const [insights, setInsights] = useState<Array<{ title: string; fix: string }>>([])
  const [insightLoading, setInsightLoading] = useState(false)

  async function load() {
    setLoading(true)
    const { data: a } = await supabase.from('seo_audits').select('*').eq('business_id', businessId).eq('status', 'complete').order('finished_at', { ascending: false }).limit(1).maybeSingle()
    setAudit(a)
    if (a) {
      const sevOrder = { high: 0, medium: 1, low: 2 }
      const { data: iss } = await supabase.from('seo_issues').select('*').eq('business_id', businessId).eq('audit_id', a.id).neq('state', 'verified')
      const sorted = ((iss ?? []) as SeoIssue[]).sort((x, y) => (sevOrder[x.severity as keyof typeof sevOrder] ?? 9) - (sevOrder[y.severity as keyof typeof sevOrder] ?? 9))
      setIssues(sorted)
      const { data: pg } = await supabase.from('seo_pages').select('url, title').eq('business_id', businessId).eq('audit_id', a.id).limit(20)
      setPages(pg ?? [])
      const { data: hist } = await supabase.from('seo_audits').select('health_score, finished_at').eq('business_id', businessId).eq('status', 'complete').order('finished_at', { ascending: true }).limit(10)
      setHistory((hist ?? []) as Array<{ health_score: number; finished_at: string }>)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [businessId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runAudit() {
    setCrawling(true)
    try {
      const res = await fetch('/api/seo/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: businessId }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error ?? 'Crawl failed — check your website URL is publicly accessible'); setCrawling(false); return }
      // Poll for completion — crawl is async, DB writes happen server-side
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        await load()
        if (attempts >= 12) { clearInterval(poll); setCrawling(false) }  // max 60s
      }, 5000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Network error'
      alert(`Crawl failed: ${msg}. Check your website URL is publicly accessible.`)
      setCrawling(false)
    }
  }

  async function markFixed(issueId: string) {
    setFixingId(issueId)
    try {
      await fetch(`/api/seo/issues/${issueId}`, { method: 'PATCH' })
      setIssues(prev => prev.filter(i => i.id !== issueId))
    } catch (e: unknown) { console.error('markFixed error:', e) }
    setFixingId(null)
    await load()
  }

  async function generateFix(issueId: string) {
    setGenerating(issueId)
    try {
      const res = await fetch('/api/seo/generate-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_id: issueId }) })
      const d = await res.json()
      if (d.suggested_fix) {
        setIssues(prev => prev.map(i => i.id === issueId ? { ...i, suggested_fix: d.suggested_fix, fix_format: d.fix_format, state: 'suggested' } : i))
        setExpanded(prev => new Set([...prev, issueId]))
      }
    } catch { /* ignore */ }
    setGenerating(null)
  }

  async function markApplied(issueId: string) {
    setApplying(issueId)
    try {
      await fetch('/api/seo/generate-fix', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_id: issueId, action: 'mark_applied' }) })
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, state: 'applied' } : i))
    } catch { /* ignore */ }
    setApplying(null)
  }

  function toggleExpand(id: string) { setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function loadInsights() {
    const topHigh = issues.filter(iss => iss.severity === 'high' && !iss.suggested_fix).slice(0, 3)
    if (!topHigh.length) return
    setInsightLoading(true)
    const next: Array<{ title: string; fix: string }> = []
    for (const iss of topHigh) {
      try {
        const res = await fetch('/api/seo/generate-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_id: iss.id }) })
        const d = await res.json()
        if (d.suggested_fix) next.push({ title: iss.title, fix: d.suggested_fix })
      } catch { /* skip */ }
    }
    setInsights(next)
    setInsightLoading(false)
  }

  const SEV: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' }
  const cell: React.CSSProperties = { padding: '16px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, minWidth: 90 }

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Loading...</p>
  if (crawling) return <p style={{ color: '#7FB897', textAlign: 'center', padding: 40, fontSize: 14 }}>Crawling your website...</p>
  if (!audit) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 12 }}>No crawl data yet.</p>
      <button onClick={runAudit} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        Run Audit Now
      </button>
    </div>
  )

  const lastCrawl = audit.finished_at ? new Date(audit.finished_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const scoreCol = audit.health_score >= 80 ? '#7FB897' : audit.health_score >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={runAudit} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Run Audit
        </button>
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 32, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <RingChart score={audit.health_score} />
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health</span>
        </div>
        <div style={{ ...cell, minWidth: 80 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: scoreCol, lineHeight: 1 }}>{audit.health_score}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</div>
        </div>
        {([['Pages crawled', audit.pages_crawled], ['Issues found', audit.issues_found], ['Fixed', audit.issues_fixed], ['Last crawl', lastCrawl]] as [string, string | number][]).map(([label, value]) => (
          <div key={label} style={cell}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          </div>
        ))}
      </div>
      {issues.length === 0 ? (
        <p style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No open issues — great work!</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {issues.map(issue => (
            <div key={issue.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEV[issue.severity] ?? '#6b7280', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{issue.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.page_url}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {issue.state === 'applied' ? (
                    <span style={{ fontSize: 11, color: '#7FB897', background: 'rgba(127,184,151,0.12)', padding: '3px 10px', borderRadius: 20 }}>Applied</span>
                  ) : issue.suggested_fix ? (
                    <>
                      <button onClick={() => toggleExpand(issue.id)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {expanded.has(issue.id) ? 'Hide' : 'View fix'}
                      </button>
                      <button onClick={() => markApplied(issue.id)} disabled={applying === issue.id} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: applying === issue.id ? 0.6 : 1 }}>
                        {applying === issue.id ? '...' : 'Mark applied'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => generateFix(issue.id)} disabled={generating === issue.id} style={{ padding: '5px 14px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: generating === issue.id ? 0.6 : 1 }}>
                        {generating === issue.id ? 'Generating...' : 'Generate fix'}
                      </button>
                      <button onClick={() => markFixed(issue.id)} disabled={fixingId === issue.id} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: fixingId === issue.id ? 0.6 : 1 }}>
                        {fixingId === issue.id ? '...' : 'Mark fixed'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {expanded.has(issue.id) && issue.suggested_fix && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '14px 16px', background: 'rgba(0,0,0,0.15)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
                    <pre style={{ flex: 1, margin: 0, fontSize: 12, color: '#7FB897', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{issue.suggested_fix}</pre>
                    <CopyBtn text={issue.suggested_fix} />
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Paste this into your site&apos;s SEO settings, then click &ldquo;Mark applied&rdquo; above.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {pages.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pages crawled ({pages.length})
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            {pages.map((p, i) => (
              <div key={p.url} style={{ display: 'flex', gap: 12, padding: '9px 14px', borderBottom: i < pages.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title ?? p.url}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.url}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {history.length > 1 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score history</div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', padding: '16px 20px' }}>
            <svg width="100%" height={72} viewBox={`0 0 ${history.length * 36} 72`} preserveAspectRatio="none">
              {history.map((h, i) => {
                const barH = Math.max(4, Math.round((h.health_score / 100) * 52))
                const col = h.health_score >= 80 ? '#7FB897' : h.health_score >= 50 ? '#f59e0b' : '#ef4444'
                return <rect key={i} x={i * 36 + 4} y={52 - barH} width={28} height={barH} rx={3} fill={col} fillOpacity={0.8} />
              })}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{new Date(history[0].finished_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{new Date(history[history.length - 1].finished_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
            </div>
          </div>
        </div>
      )}
      {audit && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aria&apos;s SEO read</div>
            <button onClick={loadInsights} disabled={insightLoading || !issues.some(iss => iss.severity === 'high' && !iss.suggested_fix)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: insightLoading ? 0.6 : 1 }}>
              {insightLoading ? 'Reading...' : "Get Aria's read"}
            </button>
          </div>
          {insights.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ background: 'rgba(127,184,151,0.06)', borderRadius: 12, border: '1px solid rgba(127,184,151,0.15)', padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#7FB897', marginBottom: 8 }}>{ins.title}</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <pre style={{ flex: 1, margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{ins.fix}</pre>
                    <CopyBtn text={ins.fix} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Local SEO ───────────────────────────────────────────────────────

function LocalSeoTab({ businessId }: { businessId: string }) {
  const [local, setLocal] = useState<SeoLocal | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  async function loadLocal() {
    const { data } = await supabase.from('seo_local').select('*').eq('business_id', businessId).maybeSingle()
    setLocal(data as SeoLocal | null)
    setLoading(false)
  }

  useEffect(() => { loadLocal() }, [businessId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function scanNow() {
    setScanning(true)
    try {
      await fetch('/api/seo/local/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: businessId }) })
      await loadLocal()
    } catch { /* ignore */ }
    setScanning(false)
  }

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Loading...</p>

  const pct = Math.max(0, Math.min(100, local?.gbp_completeness ?? 0))
  const checklist: Array<{ item: string; ok: boolean }> = Array.isArray(local?.checklist) ? (local!.checklist as Array<{ item: string; ok: boolean }>) : []
  const stats: [string, string | number][] = [
    ['Google listed', local?.gbp_listed == null ? '—' : local.gbp_listed ? 'Yes' : 'No'],
    ['Review avg', local?.review_avg != null ? (Number(local.review_avg)).toFixed(1) + ' ★' : '—'],
    ['Review count', local?.review_count ?? '—'],
    ['Map pack rank', local?.map_pack_rank ?? '—'],
    ['Citations', local?.citations_total ?? '—'],
    ['Reviews (30d)', local?.review_velocity_30d ?? '—'],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={scanNow} disabled={scanning} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: scanning ? 0.6 : 1 }}>
          {scanning ? 'Scanning...' : 'Scan now'}
        </button>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Google Business Profile completeness</span>
          <span style={{ color: '#7FB897', fontWeight: 700, fontSize: 16 }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pct + '%', background: '#7FB897', borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {stats.map(([label, value]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          </div>
        ))}
      </div>
      {checklist.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 14 }}>GBP checklist</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checklist.map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid ' + (row.ok ? '#7FB897' : 'rgba(255,255,255,0.2)'), background: row.ok ? '#7FB897' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {row.ok && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </span>
                <span style={{ fontSize: 13, color: row.ok ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)' }}>{row.item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Keywords ────────────────────────────────────────────────────────

function KeywordsTab({ businessId }: { businessId: string }) {
  const [keywords, setKeywords] = useState<SeoKeyword[]>([])
  const [newKw, setNewKw] = useState('')
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('seo_keywords').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setKeywords(data ?? [])
    setLoading(false)
  }, [businessId])

  useEffect(() => { load() }, [load])

  async function addKeyword() {
    if (!newKw.trim() || adding) return
    setAdding(true)
    try {
      await fetch('/api/seo/keywords', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: businessId, keyword: newKw.trim() }) })
    } catch { /* ignore */ }
    setNewKw('')
    await load()
    setAdding(false)
  }

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Loading...</p>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input type="text" value={newKw} onChange={e => setNewKw(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyword()} placeholder="Enter a keyword to track..."
          style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={addKeyword} disabled={adding || !newKw.trim()} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: adding || !newKw.trim() ? 0.6 : 1 }}>
          {adding ? 'Adding...' : 'Add'}
        </button>
      </div>
      {keywords.length === 0 ? (
        <p style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No keywords tracked yet. Add one above.</p>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Keyword', 'Rank', 'Change', 'Volume'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keywords.map(kw => {
                const d = kw.current_rank != null && kw.previous_rank != null ? kw.previous_rank - kw.current_rank : null
                return (
                  <tr key={kw.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 16px', color: '#fff', fontWeight: 500 }}>{kw.keyword}</td>
                    <td style={{ padding: '12px 16px', color: kw.current_rank == null ? 'rgba(255,255,255,0.3)' : '#fff' }}>{kw.current_rank == null ? 'Not tracked yet' : '#' + kw.current_rank}</td>
                    <td style={{ padding: '12px 16px', color: d == null ? 'rgba(255,255,255,0.3)' : d > 0 ? '#22c55e' : d < 0 ? '#ef4444' : 'rgba(255,255,255,0.4)' }}>
                      {d == null ? '—' : d > 0 ? '▲ ' + d : d < 0 ? '▼ ' + Math.abs(d) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: kw.search_volume == null ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)' }}>{kw.search_volume == null ? '—' : kw.search_volume.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 4: AI Optimizer ────────────────────────────────────────────────────

const OPT_TYPES = ['missing_title', 'missing_meta_description', 'missing_schema'] as const
const OPT_LABELS: Record<string, string> = { missing_title: 'Page title tag', missing_meta_description: 'Meta description', missing_schema: 'JSON-LD schema' }
const OPT_INSTRUCTIONS: Record<string, string> = {
  missing_title: "Paste into your site's <title> tag or CMS title field.",
  missing_meta_description: "Paste into your site's meta description field.",
  missing_schema: 'Paste into a <script type="application/ld+json"> block in your page <head>.',
}

function AiOptimizerTab({ businessId }: { businessId: string }) {
  const [pages, setPages] = useState<SeoPage[]>([])
  const [selectedUrl, setSelectedUrl] = useState('')
  const [pageIssues, setPageIssues] = useState<SeoIssue[]>([])
  const [results, setResults] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('seo_pages').select('url, title').eq('business_id', businessId).order('crawled_at', { ascending: false }).limit(50)
      .then(({ data }: { data: SeoPage[] | null; error: unknown }) => { setPages(data ?? []); setLoading(false) })
  }, [businessId])

  useEffect(() => {
    if (!selectedUrl) { setPageIssues([]); setResults({}); return }
    supabase.from('seo_issues').select('*').eq('business_id', businessId).eq('page_url', selectedUrl).in('issue_type', OPT_TYPES as unknown as string[])
      .then(({ data }: { data: SeoIssue[] | null; error: unknown }) => { setPageIssues(data ?? []); setResults({}) })
  }, [selectedUrl, businessId])

  async function generateAll() {
    if (!pageIssues.length || generating) return
    setGenerating(true)
    const next: Record<string, string> = {}
    for (const issue of pageIssues) {
      try {
        const res = await fetch('/api/seo/generate-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_id: issue.id }) })
        const d = await res.json()
        if (d.suggested_fix) next[issue.issue_type] = d.suggested_fix
      } catch { /* skip */ }
    }
    setResults(next)
    setGenerating(false)
  }

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Loading...</p>
  if (pages.length === 0) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 6 }}>No crawled pages yet.</p>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Pages appear after the first SEO crawl.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <select value={selectedUrl} onChange={e => setSelectedUrl(e.target.value)}
          style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#1A2620', color: selectedUrl ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Pick a page...</option>
          {pages.map(p => <option key={p.url} value={p.url}>{p.title ? p.title + ' — ' + p.url : p.url}</option>)}
        </select>
        {selectedUrl && (
          <button onClick={generateAll} disabled={generating || pageIssues.length === 0}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: generating || pageIssues.length === 0 ? 0.6 : 1 }}>
            {generating ? 'Generating...' : 'Generate with Aria'}
          </button>
        )}
      </div>
      {selectedUrl && !generating && pageIssues.length === 0 && (
        <p style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No missing title, meta, or schema issues on this page.</p>
      )}
      {Object.entries(results).map(([type, fix]) => (
        <div key={type} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', padding: '18px 20px' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{OPT_LABELS[type] ?? type}</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
            <pre style={{ flex: 1, margin: 0, fontSize: 12, color: '#7FB897', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{fix}</pre>
            <CopyBtn text={fix} />
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{OPT_INSTRUCTIONS[type]}</p>
        </div>
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

type TabId = 'health' | 'local' | 'keywords' | 'optimizer'
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'health', label: 'Site health' },
  { id: 'local', label: 'Local SEO' },
  { id: 'keywords', label: 'Keywords' },
  { id: 'optimizer', label: 'AI optimizer' },
]

export default function SeoPage() {
  const { business } = useBusinessContext()
  const [tab, setTab] = useState<TabId>('health')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [crawlTriggered, setCrawlTriggered] = useState(false)

  // Load website URL from business record — always scoped to the ACTIVE business.
  // If the active business has no website URL, the connect panel will show; we do
  // not silently fall back to another of the user's businesses.
  useEffect(() => {
    if (!business) return
    setWebsiteUrl('')
    setUrlInput('')
    const fetchWebsite = async () => {
      const { data } = await supabase.from('businesses').select('website').eq('id', business.id).single()
      if (data?.website) { setWebsiteUrl(data.website); setUrlInput(data.website) }
    }
    fetchWebsite()
  }, [business])

  async function connectWebsite() {
    if (!business) return
    let url = urlInput.trim()
    if (!url) return
    if (!url.startsWith('http')) url = 'https://' + url
    try { new URL(url) } catch { setConnectError('Please enter a valid URL'); return }
    setConnecting(true); setConnectError(null)
    try {
      const res = await fetch('/api/seo/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.id, websiteUrl: url }),
      })
      const data = await res.json()
      if (!res.ok) { setConnectError(data.error ?? 'Failed to connect'); return }
      setWebsiteUrl(url)
      setCrawlTriggered(true)
      setTimeout(() => setCrawlTriggered(false), 5000)
    } catch { setConnectError('Network error — please try again') }
    finally { setConnecting(false) }
  }

  if (!business) return null

  const isConnected = !!websiteUrl
  const hostname = isConnected ? (() => { try { return new URL(websiteUrl).hostname } catch { return websiteUrl } })() : null

  return (
    <div style={{ minHeight: '100vh', background: '#0E1411', padding: '32px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <AriaSays businessId={business?.id ?? null} page="seo" />
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 6, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>SEO</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Analyse your site, track rankings, and copy AI-generated fixes directly into your CMS.</p>

        {/* Website connection panel */}
        {!isConnected ? (
          <div style={{ marginBottom: 28, padding: '20px 24px', borderRadius: 14, border: '1px solid rgba(127,184,151,0.25)', background: 'rgba(127,184,151,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(127,184,151,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🌐</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  No website URL for {business.name ?? 'this business'} yet
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55, marginBottom: 14 }}>
                  Paste this business&apos;s website URL below — Aria will crawl it like Google does. Read-only, external audit only.
                  If you set a URL on a different business, switch to that business in the top-left picker first.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); setConnectError(null) }}
                    onKeyDown={e => e.key === 'Enter' && connectWebsite()}
                    placeholder="https://yourcafe.com.au"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 13px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                  />
                  <button onClick={connectWebsite} disabled={connecting || !urlInput.trim()}
                    style={{ padding: '9px 20px', borderRadius: 8, background: '#2D5240', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: connecting || !urlInput.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                    {connecting ? 'Connecting…' : 'Connect & crawl'}
                  </button>
                </div>
                {connectError && <p style={{ fontSize: 12, color: '#F87171', marginTop: 6 }}>✗ {connectError}</p>}
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                  Aria never writes to your website. Read-only crawl, same as Google.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(127,184,151,0.2)', background: 'rgba(127,184,151,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7FB897', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Tracking <strong style={{ color: '#7FB897' }}>{hostname}</strong></span>
            {crawlTriggered && <span style={{ fontSize: 12, color: '#7FB897', marginLeft: 4 }}>— crawl queued ✓</span>}
            <button onClick={() => { setWebsiteUrl(''); setUrlInput('') }}
              style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px', borderRadius: 4 }}>
              Change URL
            </button>
            <button onClick={() => {
              if (!business) return
              fetch('/api/seo/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId: business.id, websiteUrl, triggerCrawl: true }) })
              setCrawlTriggered(true); setTimeout(() => setCrawlTriggered(false), 5000)
            }}
              style={{ fontSize: 11, color: '#7FB897', background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.2)', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 10px', borderRadius: 6 }}>
              Run crawl now
            </button>
          </div>
        )}

        {/* Only show tabs when connected */}
        {isConnected && (
          <>
            <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none', background: tab === t.id ? 'rgba(127,184,151,0.12)' : 'transparent', color: tab === t.id ? '#7FB897' : 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: tab === t.id ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', borderBottom: tab === t.id ? '2px solid #7FB897' : '2px solid transparent' }}>
                  {t.label}
                </button>
              ))}
            </div>
            {tab === 'health' && <SiteHealthTab businessId={business.id} />}
            {tab === 'local' && <LocalSeoTab businessId={business.id} />}
            {tab === 'keywords' && <KeywordsTab businessId={business.id} />}
            {tab === 'optimizer' && <AiOptimizerTab businessId={business.id} />}
          </>
        )}
      </div>
    </div>
  )
}
