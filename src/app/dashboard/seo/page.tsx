'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { supabase } from '@/lib/supabase'
import { AriaSays } from '@/components/dashboard/AriaSays'
import { SitePreviewCard } from '@/components/SitePreviewCard'
import type { SitePreviewResult } from '@/app/api/site-preview/route'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface SeoAudit { id: string; status: string; pages_crawled: number; issues_found: number; issues_fixed: number; health_score: number; critical_count?: number | null; warning_count?: number | null; info_count?: number | null; error_detail?: string | null; started_at: string; finished_at: string | null }
interface SeoIssue { id: string; page_url: string; issue_type: string; severity: string; title: string; detail: string; suggested_fix: string | null; ai_fix_text?: string | null; fix_format: string | null; state: string; applied_at?: string | null }
interface SeoLocal { gbp_completeness: number | null; gbp_listed?: boolean | null; review_count?: number | null; review_avg?: number | null; map_pack_rank: number | null; citations_total: number | null; citations_consistent: number | null; review_velocity_30d: number | null; checklist: Array<{ item: string; ok: boolean }> | null }
interface SeoKeyword { id: string; keyword: string; current_rank: number | null; previous_rank: number | null; search_volume: number | null; frequency?: number | null; found_on_pages?: string[] | null; tracked?: boolean | null; last_checked_at?: string | null }
interface SeoPage { url: string; title: string | null }
const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 }
const SEV_COLOR: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#6b7280' }
const AI_FIXABLE = new Set(['missing_title', 'title_too_long', 'missing_meta_description', 'meta_too_long', 'missing_h1', 'thin_content', 'missing_schema', 'missing_alt_text'])
const MANUAL_TYPES = new Set(['slow_page', 'broken_link', 'broken_page'])

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

const statCell: React.CSSProperties = { padding: '16px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, minWidth: 90 }

// ── Tab 1: Site Health ─────────────────────────────────────────────────────

function SiteHealthTab({ businessId }: { businessId: string }) {
  const [audit, setAudit] = useState<SeoAudit | null>(null)
  const [issues, setIssues] = useState<SeoIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [crawling, setCrawling] = useState(false)
  const [progress, setProgress] = useState('')
  const [history, setHistory] = useState<Array<{ date: string; score: number }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: a } = await supabase.from('seo_audits').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    setAudit(a as SeoAudit | null)
    if (a?.id && a.status === 'complete') {
      const { data: iss } = await supabase.from('seo_issues').select('*').eq('business_id', businessId).eq('audit_id', a.id).neq('state', 'verified')
      setIssues((iss ?? []) as SeoIssue[])
    } else {
      setIssues([])
    }
    const { data: hist } = await supabase.from('seo_audits')
      .select('health_score, finished_at')
      .eq('business_id', businessId)
      .eq('status', 'complete')
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: true })
      .limit(8)
    setHistory((hist ?? []).map((h: { health_score: number | null; finished_at: string | null }) => ({
      date: new Date(h.finished_at ?? '').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      score: h.health_score ?? 0,
    })))
    setLoading(false)
  }, [businessId])

  useEffect(() => { load() }, [load])

  // Poll the status endpoint until the background crawl finishes.
  async function pollUntilDone(auditId: string) {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const d = await fetch(`/api/seo/audit/${auditId}/status`).then(r => r.json())
        const st = d.audit?.status
        setProgress(`Crawled ${d.audit?.pages_crawled ?? 0} pages…`)
        if (st === 'complete' || st === 'failed') { setCrawling(false); setProgress(''); await load(); return }
      } catch { /* keep polling */ }
    }
    setCrawling(false); setProgress(''); await load()
  }

  async function runAudit() {
    setCrawling(true); setProgress('Starting crawl…')
    try {
      const res = await fetch('/api/seo/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: businessId }) })
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) { alert(data.error ?? 'You can run one crawl per day.'); setCrawling(false); setProgress(''); return }
      if (!res.ok || !data.audit_id) { alert(data.error ?? 'Crawl failed — check your website URL is publicly accessible'); setCrawling(false); setProgress(''); return }
      await pollUntilDone(data.audit_id)
    } catch (e: unknown) {
      alert(`Crawl failed: ${e instanceof Error ? e.message : 'Network error'}.`)
      setCrawling(false); setProgress('')
    }
  }

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Loading…</p>

  // Group issues by type → severity + affected page count.
  const groups = new Map<string, { severity: string; title: string; detail: string; pages: Set<string> }>()
  for (const i of issues) {
    const g = groups.get(i.issue_type) ?? { severity: i.severity, title: i.title, detail: i.detail, pages: new Set<string>() }
    g.pages.add(i.page_url)
    groups.set(i.issue_type, g)
  }
  const topIssues = [...groups.values()]
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9) || b.pages.size - a.pages.size)
    .slice(0, 10)

  const crit = audit?.critical_count ?? issues.filter(i => i.severity === 'critical').length
  const warn = audit?.warning_count ?? issues.filter(i => i.severity === 'warning').length
  const info = audit?.info_count ?? issues.filter(i => i.severity === 'info').length
  const scoreCol = (audit?.health_score ?? 0) >= 80 ? '#7FB897' : (audit?.health_score ?? 0) >= 50 ? '#f59e0b' : '#ef4444'
  const lastCrawl = audit?.finished_at ? new Date(audit.finished_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={runAudit} disabled={crawling} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 13, fontWeight: 700, cursor: crawling ? 'default' : 'pointer', fontFamily: 'inherit', opacity: crawling ? 0.6 : 1 }}>
          {crawling ? 'Crawling…' : audit ? 'Re-run audit' : 'Run audit'}
        </button>
        {crawling && <span style={{ fontSize: 13, color: '#7FB897' }}>{progress}</span>}
        {audit?.status === 'crawling' && !crawling && <span style={{ fontSize: 12, color: '#f59e0b' }}>A crawl is in progress…</span>}
      </div>

      {audit?.error_detail && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', fontSize: 13, color: '#fca5a5' }}>
          {audit.error_detail}
        </div>
      )}

      {!audit ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>No crawl yet. Run your first audit to see real issues.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <RingChart score={audit.health_score} />
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health</span>
            </div>
            {([['Critical', crit, '#ef4444'], ['Warnings', warn, '#f59e0b'], ['Info', info, '#9ca3af'], ['Pages', audit.pages_crawled, '#fff'], ['Fixed', audit.issues_fixed, '#7FB897'], ['Last crawl', lastCrawl, '#fff']] as [string, string | number, string][]).map(([label, value, col]) => (
              <div key={label} style={statCell}>
                <div style={{ fontSize: 24, fontWeight: 800, color: col, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Top issues
          </div>
          {topIssues.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No open issues — great work!</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topIssues.map((g, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[g.severity] ?? '#6b7280', flexShrink: 0, marginTop: 6 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{g.title}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>{g.detail}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {g.pages.size} page{g.pages.size > 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {history.length > 1 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score history</div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 12px 8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={history}>
                    <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} width={28} />
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }} />
                    <Line type="monotone" dataKey="score" stroke="#7FB897" strokeWidth={2} dot={{ fill: '#7FB897', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
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
      await fetch('/api/seo/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: businessId }) })
      await loadLocal()
    } catch { /* ignore */ }
    setScanning(false)
  }

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Loading...</p>

  const score = Math.max(0, Math.min(100, local?.gbp_completeness ?? 0))
  const checklist: Array<{ item: string; ok: boolean }> = Array.isArray(local?.checklist) ? (local!.checklist as Array<{ item: string; ok: boolean }>) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={scanNow} disabled={scanning} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: scanning ? 0.6 : 1 }}>
          {scanning ? 'Scanning...' : 'Scan now'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <RingChart score={score} />
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Local score</span>
        </div>
        {([
          ['GBP claimed', local?.gbp_listed ? '✓' : '✗', local?.gbp_listed ? '#7FB897' : '#ef4444'],
          ['Reviews', String(local?.review_count ?? '—'), '#fff'],
          ['Avg rating', local?.review_avg != null ? local.review_avg.toFixed(1) + ' ★' : '—', local?.review_avg != null && local.review_avg >= 4 ? '#7FB897' : '#f59e0b'],
        ] as [string, string, string][]).map(([label, value, col]) => (
          <div key={label} style={statCell}>
            <div style={{ fontSize: 22, fontWeight: 800, color: col, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          </div>
        ))}
      </div>

      {checklist.length === 0 ? (
        <p style={{ textAlign: 'center', padding: 30, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Click &quot;Scan now&quot; to check your Google Business Profile health.</p>
      ) : (
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

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  cafe: ['cafe near me', 'best coffee', 'brunch near me', 'coffee shop'],
  restaurant: ['restaurant near me', 'best restaurant', 'dining near me', 'takeaway'],
  retail: ['shop near me', 'buy online', 'store near me', 'products'],
  bakery: ['fresh bread near me', 'artisan bakery', 'custom cakes', 'bakery near me'],
  pharmacy: ['pharmacy near me', 'chemist near me', 'prescription', 'medication'],
  default: ['near me', 'best', 'reviews', 'open now'],
}

function KeywordsTab({ businessId, businessName, businessIndustry }: { businessId: string; businessName?: string; businessIndustry?: string }) {
  const [keywords, setKeywords] = useState<SeoKeyword[]>([])
  const [loading, setLoading] = useState(true)
  const [addInput, setAddInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [historyMap, setHistoryMap] = useState<Record<string, Array<{ rank: number; date: string }>>>({})
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch(`/api/seo/keywords?business_id=${businessId}`).then(r => r.json())
      setKeywords((d.keywords ?? []) as SeoKeyword[])
    } catch { /* ignore */ }
    setLoading(false)
  }, [businessId])

  useEffect(() => { load() }, [load])

  async function addKeyword() {
    const kw = addInput.trim()
    if (!kw) return
    setAdding(true)
    try {
      const res = await fetch('/api/seo/keywords', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: businessId, keyword: kw }) }).then(r => r.json())
      if (res.keyword) { setKeywords(prev => [res.keyword as SeoKeyword, ...prev]); setAddInput('') }
      else if (res.error) alert(res.error)
    } catch { /* ignore */ }
    setAdding(false)
  }

  async function expandHistory(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (historyMap[id]) return
    try {
      const res = await fetch(`/api/seo/keywords/${id}`).then(r => r.json())
      setHistoryMap(prev => ({
        ...prev,
        [id]: ((res.history ?? []) as Array<{ rank: number; checked_at: string }>).map(h => ({
          rank: h.rank,
          date: new Date(h.checked_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        })),
      }))
    } catch { /* ignore */ }
  }

  async function removeKeyword(id: string) {
    setRemoving(id)
    try {
      await fetch(`/api/seo/keywords/${id}`, { method: 'DELETE' })
      setKeywords(prev => prev.filter(k => k.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch { /* ignore */ }
    setRemoving(null)
  }

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Loading…</p>

  const suggestions = (INDUSTRY_KEYWORDS[businessIndustry ?? 'default'] ?? INDUSTRY_KEYWORDS.default)
    .map(s => businessName ? `${businessName} ${s}` : s)

  return (
    <div>
      {/* Add keyword */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={addInput} onChange={e => setAddInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !adding && addKeyword()}
          placeholder='Add a keyword to track, e.g. "best cafe Melbourne"'
          style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 13px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={addKeyword} disabled={adding || !addInput.trim()}
          style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 13, fontWeight: 700, cursor: adding || !addInput.trim() ? 'default' : 'pointer', fontFamily: 'inherit', opacity: adding || !addInput.trim() ? 0.5 : 1, flexShrink: 0 }}>
          {adding ? 'Adding…' : 'Track keyword'}
        </button>
      </div>

      {keywords.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 16 }}>No keywords tracked yet.</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Try tracking these for {businessName ?? 'your business'}:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {suggestions.map(s => (
              <button key={s} onClick={() => setAddInput(s)}
                style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.08)', color: '#7FB897', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Keyword', 'Rank', 'Change', 'Volume', 'Last checked', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keywords.map(kw => {
                const rankDiff = kw.current_rank != null && kw.previous_rank != null ? kw.previous_rank - kw.current_rank : null
                const isExpanded = expandedId === kw.id
                const hist = historyMap[kw.id]
                return (
                  <>
                    <tr key={kw.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} onClick={() => expandHistory(kw.id)}>
                      <td style={{ padding: '12px 14px', color: '#fff', fontWeight: 500 }}>{kw.keyword}</td>
                      <td style={{ padding: '12px 14px', color: kw.current_rank != null ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                        {kw.current_rank != null ? `#${kw.current_rank}` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {rankDiff === null ? <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
                          : rankDiff > 0 ? <span style={{ color: '#7FB897' }}>▲{rankDiff}</span>
                          : rankDiff < 0 ? <span style={{ color: '#ef4444' }}>▼{Math.abs(rankDiff)}</span>
                          : <span style={{ color: 'rgba(255,255,255,0.3)' }}>–</span>}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.6)' }}>{kw.search_volume ?? '—'}</td>
                      <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                        {kw.last_checked_at ? new Date(kw.last_checked_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button onClick={e => { e.stopPropagation(); removeKeyword(kw.id) }} disabled={removing === kw.id}
                          style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: removing === kw.id ? 0.5 : 1 }}>
                          {removing === kw.id ? '…' : '✕'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={kw.id + '-hist'}>
                        <td colSpan={6} style={{ padding: '0 14px 14px', background: 'rgba(0,0,0,0.12)' }}>
                          {!hist ? (
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '10px 0' }}>Loading history…</p>
                          ) : hist.length < 2 ? (
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '10px 0' }}>Not enough history yet — check back after a few daily rank checks.</p>
                          ) : (
                            <div style={{ paddingTop: 10 }}>
                              <ResponsiveContainer width="100%" height={100}>
                                <LineChart data={hist}>
                                  <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} />
                                  <YAxis reversed domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} width={28} />
                                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 11 }} formatter={(v) => [`#${v}`, 'Rank']} />
                                  <Line type="monotone" dataKey="rank" stroke="#7FB897" strokeWidth={2} dot={{ fill: '#7FB897', r: 3 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 4: AI Optimiser ────────────────────────────────────────────────────

function AiOptimizerTab({ businessId }: { businessId: string }) {
  const [issues, setIssues] = useState<SeoIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [fixingId, setFixingId] = useState<string | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [applyModal, setApplyModal] = useState<{ id: string; fixText: string } | null>(null)
  const [applying, setApplying] = useState(false)
  const [bulkFixing, setBulkFixing] = useState(false)
  const [bulkProgress, setBulkProgress] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: a } = await supabase.from('seo_audits').select('id').eq('business_id', businessId).eq('status', 'complete').order('finished_at', { ascending: false }).limit(1).maybeSingle()
    if (a?.id) {
      const { data: iss } = await supabase.from('seo_issues').select('*').eq('business_id', businessId).eq('audit_id', a.id).in('severity', ['critical', 'warning']).neq('state', 'verified')
      const sorted = ((iss ?? []) as SeoIssue[]).sort((x, y) => (SEV_ORDER[x.severity] ?? 9) - (SEV_ORDER[y.severity] ?? 9))
      setIssues(sorted)
    } else { setIssues([]) }
    setLoading(false)
  }, [businessId])

  useEffect(() => { load() }, [load])

  async function markFixed(id: string) {
    setFixingId(id)
    try { await fetch(`/api/seo/issues/${id}`, { method: 'PATCH' }); setIssues(prev => prev.filter(i => i.id !== id)) }
    catch { /* ignore */ }
    setFixingId(null)
  }

  async function generateFix(id: string) {
    setGeneratingId(id)
    try {
      const d = await fetch('/api/seo/generate-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_id: id }) }).then(r => r.json())
      if (d.suggested_fix) setIssues(prev => prev.map(i => i.id === id ? { ...i, suggested_fix: d.suggested_fix, ai_fix_text: d.suggested_fix } : i))
    } catch { /* ignore */ }
    setGeneratingId(null)
  }

  async function bulkFixCritical() {
    const targets = issues.filter(i => i.severity === 'critical' && AI_FIXABLE.has(i.issue_type) && (i.ai_fix_text || i.suggested_fix) && i.state !== 'applied' && i.state !== 'flagged')
    if (targets.length === 0) return
    setBulkFixing(true)
    for (let idx = 0; idx < targets.length; idx++) {
      const issue = targets[idx]
      setBulkProgress(`Applying ${idx + 1} of ${targets.length}…`)
      const fixText = (issue.ai_fix_text || issue.suggested_fix) as string
      try {
        const res = await fetch('/api/seo/apply-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_id: issue.id, fix_value: fixText }) }).then(r => r.json())
        if (res.success) setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, state: res.state, applied_at: new Date().toISOString() } : i))
      } catch { /* continue */ }
    }
    setBulkProgress('Done! Triggering new audit…')
    try { await fetch('/api/seo/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: businessId }) }) } catch { /* ignore */ }
    setBulkFixing(false)
    setBulkProgress('')
  }

  async function applyFix(id: string, fixText: string) {
    setApplying(true)
    try {
      const res = await fetch('/api/seo/apply-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_id: id, fix_value: fixText }) }).then(r => r.json())
      if (res.success) {
        setIssues(prev => prev.map(i => i.id === id ? { ...i, state: res.state, applied_at: new Date().toISOString() } : i))
        setApplyModal(null)
      }
    } catch { /* ignore */ }
    setApplying(false)
  }

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Loading…</p>
  if (issues.length === 0) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 6 }}>No critical or warning issues to fix.</p>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Run an audit from the Site health tab to generate AI fixes.</p>
    </div>
  )

  return (
    <>
      {applyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => !applying && setApplyModal(null)}>
          <div style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 24, maxWidth: 560, width: '100%' }}
            onClick={e => e.stopPropagation()}>
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Apply fix — review &amp; edit</p>
            <textarea value={applyModal.fixText} onChange={e => setApplyModal(m => m ? { ...m, fixText: e.target.value } : null)} rows={6}
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', color: '#7FB897', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '6px 0 16px' }}>Edit the fix above, then click Apply to mark this issue as applied.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => applyFix(applyModal.id, applyModal.fixText)} disabled={applying}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 13, fontWeight: 700, cursor: applying ? 'default' : 'pointer', fontFamily: 'inherit', opacity: applying ? 0.6 : 1 }}>
                {applying ? 'Applying…' : 'Apply fix'}
              </button>
              <button onClick={() => setApplyModal(null)} disabled={applying}
                style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {(() => {
        const bulkable = issues.filter(i => i.severity === 'critical' && AI_FIXABLE.has(i.issue_type) && (i.ai_fix_text || i.suggested_fix) && i.state !== 'applied' && i.state !== 'flagged')
        return bulkable.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12 }}>
            <div style={{ flex: 1 }}>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{bulkable.length} critical issue{bulkable.length > 1 ? 's' : ''} with AI fixes ready</span>
              {bulkProgress && <span style={{ display: 'block', fontSize: 12, color: '#7FB897', marginTop: 2 }}>{bulkProgress}</span>}
            </div>
            <button onClick={bulkFixCritical} disabled={bulkFixing}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: bulkFixing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: bulkFixing ? 0.6 : 1, flexShrink: 0 }}>
              {bulkFixing ? 'Fixing…' : 'Fix all critical issues'}
            </button>
          </div>
        ) : null
      })()}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {issues.map(issue => {
          const fix = issue.ai_fix_text || issue.suggested_fix
          const isApplied = issue.state === 'applied'
          const isFlagged = issue.state === 'flagged'
          const isManual = MANUAL_TYPES.has(issue.issue_type)
          const isAiFix = AI_FIXABLE.has(issue.issue_type)
          return (
            <div key={issue.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[issue.severity] ?? '#6b7280', flexShrink: 0, marginTop: 6 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{issue.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.page_url}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                  {isApplied ? (
                    <span style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontSize: 11, fontWeight: 700 }}>
                      ✓ Applied{issue.applied_at ? ' ' + new Date(issue.applied_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}
                    </span>
                  ) : isFlagged || isManual ? (
                    <a href="https://web.dev/performance/" target="_blank" rel="noreferrer"
                      style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                      ⚠ Manual fix
                    </a>
                  ) : fix && isAiFix ? (
                    <button onClick={() => setApplyModal({ id: issue.id, fixText: fix })}
                      style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Apply Fix
                    </button>
                  ) : null}
                  <button onClick={() => markFixed(issue.id)} disabled={fixingId === issue.id}
                    style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: fixingId === issue.id ? 0.6 : 1 }}>
                    {fixingId === issue.id ? '…' : 'Mark as fixed'}
                  </button>
                </div>
              </div>
              {fix ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(0,0,0,0.18)', borderRadius: 10, padding: '12px 14px' }}>
                  <pre style={{ flex: 1, margin: 0, fontSize: 12, color: '#7FB897', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fix}</pre>
                  <CopyBtn text={fix} />
                </div>
              ) : !isManual ? (
                <button onClick={() => generateFix(issue.id)} disabled={generatingId === issue.id}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: generatingId === issue.id ? 0.6 : 1 }}>
                  {generatingId === issue.id ? 'Generating…' : 'Generate fix with Aria'}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
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
  const [preview, setPreview] = useState<SitePreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)

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

  // Step 1 — fetch a live preview of the typed URL so the owner can confirm it's really theirs.
  async function startPreview() {
    if (!business) return
    const url = urlInput.trim()
    if (!url) return
    setPreviewing(true); setConnectError(null); setPreview(null)
    try {
      const res = await fetch('/api/site-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      })
      const data = (await res.json()) as SitePreviewResult
      setPreview(data)
    } catch { setConnectError('Network error — please try again') }
    finally { setPreviewing(false) }
  }

  // Step 2 — owner confirmed ("Yes, that's my site" or "Save anyway") → save + queue crawl.
  async function confirmWebsite() {
    if (!business) return
    const saveUrl = preview && preview.ok ? preview.finalUrl : (urlInput.trim().startsWith('http') ? urlInput.trim() : 'https://' + urlInput.trim())
    setConnecting(true); setConnectError(null)
    try {
      const res = await fetch('/api/seo/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.id, websiteUrl: saveUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setConnectError(data.error ?? 'Failed to connect'); return }
      setWebsiteUrl(data.website_url ?? saveUrl)
      setUrlInput(data.website_url ?? saveUrl)
      setPreview(null)
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
                {preview && (
                  <div style={{ marginBottom: 14 }}>
                    <SitePreviewCard result={preview} onConfirm={confirmWebsite} onReject={() => setPreview(null)} busy={connecting} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); setConnectError(null); setPreview(null) }}
                    onKeyDown={e => e.key === 'Enter' && startPreview()}
                    placeholder="https://yourcafe.com.au"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 13px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                  />
                  <button onClick={startPreview} disabled={previewing || !urlInput.trim()}
                    style={{ padding: '9px 20px', borderRadius: 8, background: '#2D5240', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: previewing || !urlInput.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                    {previewing ? 'Fetching your site…' : 'Preview & confirm'}
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
            <button onClick={() => { setUrlInput(websiteUrl); setWebsiteUrl(''); setPreview(null) }}
              style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px', borderRadius: 4 }}>
              Change URL
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
            {tab === 'keywords' && <KeywordsTab businessId={business.id} businessName={business.name ?? undefined} businessIndustry={(business as unknown as { industry?: string }).industry ?? undefined} />}
            {tab === 'optimizer' && <AiOptimizerTab businessId={business.id} />}
          </>
        )}
      </div>
    </div>
  )
}
