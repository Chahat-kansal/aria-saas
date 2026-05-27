'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { AuditScoreCard } from '@/components/dashboard/Prompt55Extensions'

interface AuditResult { template_id: string; name: string; category: string; required: boolean; passed: boolean; note?: string }
interface ShiftAudit { id: string; shift_date: string; cashier_name: string | null; total_checks: number; passed_checks: number; failed_checks: number; flagged_items: Array<{ name: string; category: string; note: string }>; aria_assessment: string | null; results: AuditResult[] }
interface AuditTemplate { id: string; name: string; description: string | null; check_type: string; category: string; required: boolean; sort_order: number }

const CAT_COLOR: Record<string, string> = { compliance: '#F59E0B', safety: '#EF4444', cash: '#7FB897', hygiene: '#06B6D4', stock: '#8B5CF6', security: '#EC4899', general: '#6B7280' }

export default function AuditChecksPage() {
  const [audits, setAudits] = useState<ShiftAudit[]>([])
  const [templates, setTemplates] = useState<AuditTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ShiftAudit | null>(null)
  const [tab, setTab] = useState<'history' | 'do-audit'>('history')
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, t] = await Promise.all([fetch('/api/pos/shift-audits').then(r => r.json()) as Promise<{ audits?: ShiftAudit[] }>, fetch('/api/pos/shift-audits?type=templates').then(r => r.json()) as Promise<{ templates?: AuditTemplate[] }>])
      setAudits(a.audits ?? []); setTemplates(t.templates ?? [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, string>>({})

  async function uploadPhoto(templateId: string, file: File) {
    const form = new FormData()
    form.append('audit_id', 'pending')
    form.append('item_id', templateId)
    form.append('photo', file)
    const r = await fetch('/api/audit-checks/photo', { method: 'POST', body: form }).then(r => r.json()).catch(() => null)
    if (r?.photo?.photo_url) setUploadedPhotos(p => ({ ...p, [templateId]: r.photo.photo_url }))
  }

  const submit = async () => {
    // Validation: any failed item without a corrective action note?
    const failedMissingNote = templates.filter(t => answers[t.id] === false && !(notes[t.id] ?? '').trim())
    if (failedMissingNote.length > 0) {
      setMsg('Add a corrective action for every failed check before saving.')
      return
    }
    setSubmitting(true); setMsg('')
    const results = templates.map(t => ({ template_id: t.id, name: t.name, category: t.category, required: t.required, passed: answers[t.id] ?? false, note: notes[t.id] ?? '', photo_url: uploadedPhotos[t.id] ?? null }))
    try {
      const r = await fetch('/api/pos/shift-audits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results }) })
      const d = await r.json() as { ok?: boolean; error?: string }
      if (d.ok) { setMsg('Audit submitted!'); setAnswers({}); setNotes({}); setUploadedPhotos({}); setTab('history'); load() } else setMsg(d.error ?? 'Failed')
    } catch { setMsg('Error') } finally { setSubmitting(false) }
  }

  // Recurring failures: items that failed in 3+ of last 5 audits
  const recurringFailures = (() => {
    const last5 = audits.slice(0, 5)
    if (last5.length < 3) return [] as string[]
    const counts: Record<string, number> = {}
    for (const a of last5) for (const r of a.results ?? []) if (!r.passed && r.required) counts[r.name] = (counts[r.name] ?? 0) + 1
    return Object.entries(counts).filter(([, c]) => c >= 3).map(([name]) => name)
  })()

  const S = { surface: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)' }
  const rate = (a: ShiftAudit) => a.total_checks > 0 ? Math.round(a.passed_checks / a.total_checks * 100) : 0

  return (
    <div style={{ padding: 24, maxWidth: 900, color: '#e8ede7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Audit Checks</h1><p style={{ fontSize: 13, color: S.dim, marginTop: 4 }}>Compliance checks — failures are flagged in your daily briefing</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['history', 'do-audit'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (tab === t ? 'rgba(127,184,151,0.5)' : S.border), background: tab === t ? 'rgba(127,184,151,0.1)' : 'transparent', color: tab === t ? S.green : S.dim }}>{t === 'history' ? 'History' : '+ Do Audit'}</button>
          ))}
        </div>
      </div>

      {recurringFailures.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#fca5a5' }}>
          ⚠ Recurring failure{recurringFailures.length > 1 ? 's' : ''} across last 5 audits: <strong>{recurringFailures.join(', ')}</strong>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 48, color: S.dim }}>Loading…</div> : tab === 'history' ? (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {audits.length === 0 ? <div style={{ textAlign: 'center', padding: 48, color: S.dim }}><p>No audits yet. Click "+ Do Audit" to start.</p></div> : audits.map(a => (
              <div key={a.id} onClick={() => setSelected(selected?.id === a.id ? null : a)}
                style={{ background: selected?.id === a.id ? 'rgba(127,184,151,0.08)' : S.surface, border: '1px solid ' + (a.flagged_items.length > 0 ? 'rgba(239,68,68,0.3)' : (selected?.id === a.id ? 'rgba(127,184,151,0.3)' : S.border)), borderRadius: 12, padding: '14px 18px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{new Date(a.shift_date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}</p><p style={{ fontSize: 12, color: S.dim, margin: '2px 0 0' }}>{a.cashier_name || 'Unknown'}</p></div>
                  <div style={{ textAlign: 'right' }}><span style={{ fontSize: 16, fontWeight: 700, color: rate(a) >= 80 ? S.green : rate(a) >= 60 ? '#F59E0B' : '#EF4444' }}>{rate(a)}%</span><p style={{ fontSize: 11, color: S.muted, margin: '2px 0 0' }}>{a.passed_checks}/{a.total_checks} passed</p></div>
                </div>
                {a.flagged_items.length > 0 && (<div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}><p style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', margin: '0 0 4px' }}>⚠ {a.flagged_items.length} required check{a.flagged_items.length > 1 ? 's' : ''} failed</p>{a.flagged_items.slice(0, 3).map((f, i) => <p key={i} style={{ fontSize: 11, color: 'rgba(239,68,68,0.7)', margin: 0 }}>• {f.name}</p>)}</div>)}
                {a.aria_assessment && !a.flagged_items.length && <p style={{ fontSize: 12, color: S.dim, margin: '8px 0 0', fontStyle: 'italic' }}>{a.aria_assessment}</p>}
              </div>
            ))}
          </div>
          {selected && (
            <div style={{ background: S.surface, border: '1px solid ' + S.border, borderRadius: 16, padding: 20, height: 'fit-content', position: 'sticky', top: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Detail</h2><button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.dim, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.results.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 14, color: r.passed ? S.green : (r.required ? '#EF4444' : '#F59E0B') }}>{r.passed ? '✓' : '✗'}</span>
                    <div style={{ flex: 1 }}><p style={{ fontSize: 13, margin: 0, color: r.passed ? '#e8ede7' : (r.required ? '#fca5a5' : '#FCD34D') }}>{r.name}</p>{r.note && <p style={{ fontSize: 11, color: S.muted, margin: '2px 0 0' }}>{r.note}</p>}</div>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: (CAT_COLOR[r.category] ?? '#6B7280') + '22', color: CAT_COLOR[r.category] ?? '#6B7280' }}>{r.category}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ maxWidth: 600 }}>
          <AuditScoreCard totalItems={templates.length} completedItems={Object.keys(answers).length} failedItems={Object.values(answers).filter(v => v === false).length} />
          {templates.length === 0 ? <div style={{ textAlign: 'center', padding: 48, color: S.dim }}>No audit templates found.</div> : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {templates.map(t => (
                  <div key={t.id} style={{ background: S.surface, border: '1px solid ' + (answers[t.id] === false && t.required ? 'rgba(239,68,68,0.3)' : S.border), borderRadius: 12, padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: (CAT_COLOR[t.category] ?? '#6B7280') + '22', color: CAT_COLOR[t.category] ?? '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.category}</span>
                          {t.required && <span style={{ fontSize: 9, color: '#EF4444', fontWeight: 600 }}>REQUIRED</span>}
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{t.name}</p>
                        {t.description && <p style={{ fontSize: 12, color: S.dim, margin: '4px 0 0' }}>{t.description}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {([true, false] as const).map(v => (
                          <button key={String(v)} onClick={() => setAnswers(prev => ({ ...prev, [t.id]: v }))}
                            style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (answers[t.id] === v ? (v ? 'rgba(127,184,151,0.6)' : 'rgba(239,68,68,0.6)') : S.border), background: answers[t.id] === v ? (v ? 'rgba(127,184,151,0.15)' : 'rgba(239,68,68,0.1)') : 'transparent', color: answers[t.id] === v ? (v ? S.green : '#EF4444') : S.dim }}>
                            {v ? '✓ Pass' : '✗ Fail'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {answers[t.id] === false && (
                      <input placeholder="Corrective action required — what will you do to fix this? *"
                        value={notes[t.id] ?? ''} onChange={e => setNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                        style={{ marginTop: 10, width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + ((notes[t.id] ?? '').trim() ? 'rgba(127,184,151,0.3)' : 'rgba(239,68,68,0.4)'), borderRadius: 7, color: '#e8ede7', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                    )}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input ref={el => { fileRefs.current[t.id] = el }} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(t.id, f) }} />
                      <button type="button" onClick={() => fileRefs.current[t.id]?.click()}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid ' + S.border, background: 'transparent', color: S.dim, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                        📷 {uploadedPhotos[t.id] ? 'Replace photo' : 'Add photo'}
                      </button>
                      {uploadedPhotos[t.id] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={uploadedPhotos[t.id]} alt="evidence" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid ' + S.border }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={submit} disabled={submitting || Object.keys(answers).length === 0}
                  style={{ padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#2D5240', color: '#fff', opacity: submitting || Object.keys(answers).length === 0 ? 0.5 : 1 }}>
                  {submitting ? 'Submitting…' : 'Submit Audit'}
                </button>
                {msg && <span style={{ fontSize: 13, color: msg.includes('!') ? S.green : '#EF4444' }}>{msg}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
