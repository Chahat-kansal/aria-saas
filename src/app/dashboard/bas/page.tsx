'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

type TabId = 'current' | 'history' | 'classification' | 'super' | 'settings'

interface BasDraft {
  id: string; quarter: string; period_start: string; period_end: string; due_date: string; status: string
  g1_total_sales: number; g3_gst_free_sales: number; g4_input_taxed_sales: number
  field_1a_gst_on_sales: number; field_1b_gst_credits: number; net_gst: number
  w1_total_salary_wages: number; w2_amounts_withheld: number; total_payable: number
  unclassified_sales_count: number; reconciliation_gaps: string[]; handover_summary: string | null
  lodged_at: string | null
}

interface Classification {
  id: string; product_id: string; gst_treatment: string; ato_tax_code: string
  classification_source: string; ai_confidence: number | null; notes: string | null
  pos_products: { name: string; category: string | null } | null
}

interface SuperObligation {
  id: string; staff_name: string; quarter: string; period_start: string; period_end: string
  ordinary_time_earnings: number; super_rate_pct: number; super_amount_owed: number
  payment_due_date: string | null; status: string; paid_at: string | null
}

const surface = 'rgba(255,255,255,0.04)'
const border = '1px solid rgba(255,255,255,0.08)'

const statusColor: Record<string, string> = {
  draft: 'rgba(255,255,255,0.3)',
  reviewed: '#F59E0B',
  lodged: '#7FB897',
  amended: '#8B5CF6',
}

const treatmentColor: Record<string, string> = {
  taxable: 'rgba(255,255,255,0.6)',
  gst_free: 'rgba(127,184,151,0.8)',
  input_taxed: 'rgba(245,158,11,0.8)',
  out_of_scope: 'rgba(255,255,255,0.3)',
}

export default function BasPage() {
  const { business } = useBusinessContext()
  const [tab, setTab] = useState<TabId>('current')
  const [drafts, setDrafts] = useState<BasDraft[]>([])
  const [classifications, setClassifications] = useState<Classification[]>([])
  const [superObligations, setSuperObligations] = useState<SuperObligation[]>([])
  const [loading, setLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [classifyResult, setClassifyResult] = useState<{ classified: number; needs_review: Array<{ name: string; confidence: number }> } | null>(null)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [classFilter, setClassFilter] = useState<'all' | 'needs_review'>('all')

  const bid = business?.id

  const loadData = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    try {
      const [draftsRes, classRes, superRes] = await Promise.all([
        fetch('/api/agents/bas/draft'),
        fetch('/api/agents/bas/classifications'),
        fetch('/api/agents/bas/super'),
      ])
      if (draftsRes.ok) { const d = await draftsRes.json() as { drafts: BasDraft[] }; setDrafts(d.drafts ?? []) }
      if (classRes.ok) { const d = await classRes.json() as { classifications: Classification[] }; setClassifications(d.classifications ?? []) }
      if (superRes.ok) { const d = await superRes.json() as { obligations: SuperObligation[] }; setSuperObligations(d.obligations ?? []) }
    } catch (e) { console.error('[non-fatal]', e) }
    setLoading(false)
  }, [bid])

  useEffect(() => { void loadData() }, [loadData])

  const currentDraft = drafts[0] ?? null
  const now = new Date()

  const generateDraft = async () => {
    setGeneratingDraft(true)
    await fetch('/api/agents/bas/draft', { method: 'POST' })
    setGeneratingDraft(false)
    void loadData()
  }

  const updateDraftStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    await fetch('/api/agents/bas/draft/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setUpdatingId(null)
    void loadData()
  }

  const runClassification = async () => {
    setClassifying(true)
    const res = await fetch('/api/agents/bas/classify-products', { method: 'POST' })
    if (res.ok) { const d = await res.json() as typeof classifyResult; setClassifyResult(d) }
    setClassifying(false)
    void loadData()
  }

  const markSuperPaid = async (id: string, amount: number) => {
    setUpdatingId(id)
    await fetch('/api/agents/bas/super?id=' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paid', payment_amount: amount }) })
    setUpdatingId(null)
    void loadData()
  }

  const filteredClassifications = classFilter === 'needs_review'
    ? classifications.filter(c => !c.ai_confidence || c.ai_confidence < 0.7)
    : classifications

  const totalSuperOwed = superObligations.filter(s => s.status !== 'paid').reduce((sum, s) => sum + Number(s.super_amount_owed), 0)
  const superDueSoon = superObligations.filter(s => s.status !== 'paid' && s.payment_due_date && (new Date(s.payment_due_date).getTime() - now.getTime()) / 86400000 < 14)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0D1F14 0%,#0a0a0a 60%,#111 100%)', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 }}>Tax &amp; BAS Compliance</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '6px 0 0' }}>Business Activity Statement · Super obligations · Product GST classification</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 0 }}>
        {(['current','history','classification','super','settings'] as TabId[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', background: tab === t ? 'rgba(45,82,64,0.4)' : 'transparent', color: tab === t ? '#7FB897' : 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: tab === t ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize' }}>
            {t === 'current' ? 'Current Quarter' : t === 'classification' ? 'Product Classification' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 60 }}>Loading BAS data...</div>
      ) : (
        <>
          {/* ── Current Quarter ── */}
          {tab === 'current' && (
            <div>
              {!currentDraft ? (
                <div style={{ background: surface, border, borderRadius: 16, padding: 40, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 16 }}>📋</div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>No BAS draft for the current quarter yet.</p>
                  <button onClick={generateDraft} disabled={generatingDraft} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    {generatingDraft ? 'Generating...' : 'Generate BAS Draft'}
                  </button>
                </div>
              ) : (
                <div>
                  {/* Quarter header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>{currentDraft.quarter}</h2>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '4px 0 0' }}>
                        {currentDraft.period_start} to {currentDraft.period_end} · Due {currentDraft.due_date}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: statusColor[currentDraft.status] + '22', color: statusColor[currentDraft.status], fontWeight: 700, textTransform: 'uppercase' }}>{currentDraft.status}</span>
                      <button onClick={generateDraft} disabled={generatingDraft} style={{ padding: '6px 14px', borderRadius: 8, border, background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>
                        {generatingDraft ? '...' : 'Regenerate'}
                      </button>
                    </div>
                  </div>

                  {/* Unclassified warning */}
                  {currentDraft.unclassified_sales_count > 0 && (
                    <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#F59E0B' }}>⚠ {currentDraft.unclassified_sales_count} sale items without GST classification — may affect BAS accuracy</span>
                      <button onClick={() => setTab('classification')} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)', background: 'transparent', color: '#F59E0B', fontSize: 12, cursor: 'pointer' }}>
                        Classify now →
                      </button>
                    </div>
                  )}

                  {/* BAS Fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                    <div style={{ background: surface, border, borderRadius: 14, padding: 20 }}>
                      <h4 style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>GST on Sales</h4>
                      {[
                        { label: 'G1 Total sales', value: currentDraft.g1_total_sales },
                        { label: 'G3 GST-free sales', value: currentDraft.g3_gst_free_sales },
                        { label: 'G4 Input-taxed sales', value: currentDraft.g4_input_taxed_sales },
                      ].map(f => (
                        <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{f.label}</span>
                          <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>${Number(f.value).toFixed(2)}</span>
                        </div>
                      ))}
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 14, color: '#7FB897', fontWeight: 700 }}>1A GST on sales</span>
                        <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 18, color: '#7FB897' }}>${Number(currentDraft.field_1a_gst_on_sales).toFixed(2)}</span>
                      </div>
                    </div>

                    <div style={{ background: surface, border, borderRadius: 14, padding: 20 }}>
                      <h4 style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>GST Credits</h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>G11 Non-capital purchases</span>
                        <span style={{ fontSize: 13, color: '#fff' }}>—</span>
                      </div>
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                        <span style={{ fontSize: 14, color: '#7FB897', fontWeight: 700 }}>1B GST credits</span>
                        <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 18, color: '#7FB897' }}>${Number(currentDraft.field_1b_gst_credits).toFixed(2)}</span>
                      </div>
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 15, color: Number(currentDraft.net_gst) >= 0 ? '#EF4444' : '#7FB897', fontWeight: 700 }}>Net GST</span>
                        <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 22, color: Number(currentDraft.net_gst) >= 0 ? '#EF4444' : '#7FB897' }}>
                          ${Math.abs(Number(currentDraft.net_gst)).toFixed(2)}{Number(currentDraft.net_gst) < 0 ? ' refund' : ''}
                        </span>
                      </div>
                    </div>

                    <div style={{ background: surface, border, borderRadius: 14, padding: 20 }}>
                      <h4 style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>PAYG Withholding</h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>W1 Total wages</span>
                        <span style={{ fontSize: 13, color: '#fff' }}>${Number(currentDraft.w1_total_salary_wages).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 14, color: '#7FB897', fontWeight: 700 }}>W2 Tax withheld</span>
                        <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 18, color: '#7FB897' }}>${Number(currentDraft.w2_amounts_withheld).toFixed(2)}</span>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(45,82,64,0.15)', border: '1px solid rgba(45,82,64,0.4)', borderRadius: 14, padding: 20 }}>
                      <h4 style={{ color: 'rgba(127,184,151,0.7)', fontSize: 11, fontWeight: 700, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>Total Payable to ATO</h4>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 36, color: '#7FB897', marginBottom: 6 }}>
                        ${Number(currentDraft.total_payable).toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Due {currentDraft.due_date}</div>
                    </div>
                  </div>

                  {/* Handover summary */}
                  {currentDraft.handover_summary && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Accountant Summary</div>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{currentDraft.handover_summary}</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {currentDraft.status === 'draft' && (
                      <button disabled={updatingId === currentDraft.id} onClick={() => void updateDraftStatus(currentDraft.id, 'reviewed')} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#F59E0B', color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        {updatingId === currentDraft.id ? '...' : 'Mark as reviewed'}
                      </button>
                    )}
                    {currentDraft.status !== 'lodged' && (
                      <button disabled={updatingId === currentDraft.id} onClick={() => void updateDraftStatus(currentDraft.id, 'lodged')} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0D1F14', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        {updatingId === currentDraft.id ? '...' : 'Mark as lodged'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── History ── */}
          {tab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {drafts.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 40 }}>No BAS history yet</div>
              ) : drafts.map(d => (
                <div key={d.id} style={{ background: surface, border, borderRadius: 12, padding: '14px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{d.quarter}</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 12 }}>{d.period_start} to {d.period_end}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#7FB897' }}>Net GST: ${Number(d.net_gst).toFixed(0)}</span>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>PAYG: ${Number(d.w2_amounts_withheld).toFixed(0)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Total: ${Number(d.total_payable).toFixed(0)}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: statusColor[d.status] + '22', color: statusColor[d.status], fontWeight: 700 }}>{d.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Product Classification ── */}
          {tab === 'classification' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setClassFilter('all')} style={{ padding: '6px 14px', borderRadius: 8, border, background: classFilter === 'all' ? 'rgba(45,82,64,0.4)' : 'transparent', color: classFilter === 'all' ? '#7FB897' : 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>All</button>
                  <button onClick={() => setClassFilter('needs_review')} style={{ padding: '6px 14px', borderRadius: 8, border, background: classFilter === 'needs_review' ? 'rgba(245,158,11,0.2)' : 'transparent', color: classFilter === 'needs_review' ? '#F59E0B' : 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>
                    Needs Review ({classifications.filter(c => !c.ai_confidence || c.ai_confidence < 0.7).length})
                  </button>
                </div>
                <button onClick={runClassification} disabled={classifying} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {classifying ? 'Running AI classification...' : 'Run AI classification'}
                </button>
              </div>

              {classifyResult && (
                <div style={{ background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: '#7FB897' }}>Classified {classifyResult.classified} products. {classifyResult.needs_review.length} need manual review.</span>
                </div>
              )}

              <div style={{ background: surface, border, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr', gap: 0, padding: '10px 16px', borderBottom: border }}>
                  {['Product', 'Treatment', 'Confidence', 'Source'].map(h => (
                    <div key={h} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase' }}>{h}</div>
                  ))}
                </div>
                {filteredClassifications.slice(0, 50).map(c => (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr', gap: 0, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: (!c.ai_confidence || c.ai_confidence < 0.7) ? 'rgba(239,68,68,0.04)' : undefined }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#fff' }}>{c.pos_products?.name ?? c.product_id}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{c.pos_products?.category ?? ''}</div>
                    </div>
                    <div style={{ fontSize: 12, color: treatmentColor[c.gst_treatment] ?? 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{c.gst_treatment}</div>
                    <div style={{ fontSize: 12, color: c.ai_confidence && c.ai_confidence >= 0.7 ? '#7FB897' : '#F59E0B' }}>
                      {c.ai_confidence ? Math.round(c.ai_confidence * 100) + '%' : 'Manual'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'capitalize' }}>{c.classification_source.replace('_', ' ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Super ── */}
          {tab === 'super' && (
            <div>
              {superDueSoon.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: '#EF4444' }}>⚠ {superDueSoon.length} super payment{superDueSoon.length > 1 ? 's' : ''} due within 14 days — total ${superDueSoon.reduce((s, o) => s + Number(o.super_amount_owed), 0).toFixed(0)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 22, color: '#7FB897' }}>
                  ${totalSuperOwed.toFixed(0)} <span style={{ fontSize: 14, fontStyle: 'normal', color: 'rgba(255,255,255,0.4)' }}>total owed</span>
                </div>
              </div>

              <div style={{ background: surface, border, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 0, padding: '10px 16px', borderBottom: border }}>
                  {['Staff', 'Quarter', 'Earnings', 'Super owed', 'Due date', 'Status'].map(h => (
                    <div key={h} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase' }}>{h}</div>
                  ))}
                </div>
                {superObligations.slice(0, 30).map(s => (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 0, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: '#fff' }}>{s.staff_name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{s.quarter}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>${Number(s.ordinary_time_earnings).toFixed(0)}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#7FB897' }}>${Number(s.super_amount_owed).toFixed(0)}</div>
                    <div style={{ fontSize: 12, color: s.payment_due_date && new Date(s.payment_due_date) < now ? '#EF4444' : 'rgba(255,255,255,0.5)' }}>{s.payment_due_date ?? '—'}</div>
                    <div>
                      {s.status === 'paid' ? (
                        <span style={{ fontSize: 11, color: '#7FB897', fontWeight: 700 }}>Paid ✓</span>
                      ) : (
                        <button disabled={updatingId === s.id} onClick={() => void markSuperPaid(s.id, Number(s.super_amount_owed))} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 11, cursor: 'pointer' }}>
                          {updatingId === s.id ? '...' : 'Mark paid'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Settings ── */}
          {tab === 'settings' && (
            <div style={{ background: surface, border, borderRadius: 16, padding: 24 }}>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>BAS Settings</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
                {[
                  { label: 'ABN', value: (business as { abn?: string } | null)?.abn ?? 'Not set' },
                  { label: 'Business name', value: business?.name ?? '' },
                  { label: 'BAS frequency', value: 'Quarterly' },
                  { label: 'Super rate', value: '11.5% (2026)' },
                ].map(f => (
                  <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{f.label}</span>
                    <span style={{ fontSize: 13, color: '#fff' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
