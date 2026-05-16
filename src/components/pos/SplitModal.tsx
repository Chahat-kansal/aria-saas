'use client'
import { useState, useRef, useEffect } from 'react'

export interface CartItemForSplit {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

interface Props {
  saleId: string
  saleTotal: number
  saleTax: number
  cartItems: CartItemForSplit[]
  onSaved: () => void
  onClose: () => void
}

type Tab = 'manual' | 'ocr' | 'group' | 'ai'
type SplitMethod = 'even' | 'by_item' | 'by_amount' | 'by_percent'

interface SplitRow { id: string; label: string; amount: string; tip: string }

const TABS: { id: Tab; label: string }[] = [
  { id: 'manual', label: '✏️ Manual' },
  { id: 'ocr',    label: '📷 Scan' },
  { id: 'group',  label: '👥 Group' },
  { id: 'ai',     label: '🤖 Aria' },
]

const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

const OVERLAY: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const PANEL: React.CSSProperties = { background: 'var(--bg-elevated)', borderRadius: 16, width: 'min(680px, 96vw)', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }

export default function SplitModal({ saleId, saleTotal, saleTax, cartItems, onSaved, onClose }: Props) {
  // ── Draft bootstrapping ────────────────────────────────────────────
  const [resolvedSaleId, setResolvedSaleId] = useState(saleId || '')
  const [bootstrapping, setBootstrapping] = useState(!saleId)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  useEffect(() => {
    if (saleId) {
      setResolvedSaleId(saleId)
      setBootstrapping(false)
      return
    }
    if (!cartItems || cartItems.length === 0) {
      setBootstrapError('No items in cart to split')
      setBootstrapping(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/pos/sales/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cart_items: cartItems.map(c => ({
              product_id: (c as any).product_id ?? c.id ?? null,
              product_name: c.product_name,
              quantity: c.quantity,
              unit_price: c.unit_price,
              line_total: c.line_total,
            })),
            total_amount: saleTotal,
            tax_amount: saleTax,
          }),
        })
        const d = await r.json()
        if (cancelled) return
        if (!r.ok) {
          setBootstrapError(d.error ?? 'Failed to start split')
        } else {
          setResolvedSaleId(d.sale_id)
        }
      } catch (e: any) {
        if (!cancelled) setBootstrapError(e.message ?? 'Failed to start split')
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    })()
    return () => { cancelled = true }
  }, [saleId, cartItems, saleTotal, saleTax])

  // ── Helpers: void draft on cancel, promote on save ─────────────────
  const voidDraftAndClose = async () => {
    if (resolvedSaleId && !saleId) {
      try { await fetch(`/api/pos/sales/draft/${resolvedSaleId}/void`, { method: 'POST' }) } catch { /* ignore */ }
    }
    onClose()
  }

  const promoteAndSave = async () => {
    if (resolvedSaleId && !saleId) {
      try { await fetch(`/api/pos/sales/draft/${resolvedSaleId}/promote`, { method: 'POST' }) } catch { /* ignore */ }
    }
    onSaved()
  }

  // ── UI state ───────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('manual')
  const [method, setMethod] = useState<SplitMethod>('even')
  const [splits, setSplits] = useState<SplitRow[]>([
    { id: '1', label: 'Person 1', amount: (saleTotal / 2).toFixed(2), tip: '0' },
    { id: '2', label: 'Person 2', amount: (saleTotal / 2).toFixed(2), tip: '0' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrItems, setOcrItems] = useState<any[]>([])
  const [ocrTotal, setOcrTotal] = useState<number | null>(null)
  const [ocrScanId, setOcrScanId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Group state
  const [groups, setGroups] = useState<any[]>([])
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null)
  const [groupMembers, setGroupMembers] = useState<any[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [groupsLoaded, setGroupsLoaded] = useState(false)

  // AI state
  const [aiMembers, setAiMembers] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<any | null>(null)

  const splitTotal = splits.reduce((s, r) => s + (parseFloat(r.amount) || 0) + (parseFloat(r.tip) || 0), 0)
  const diff = Math.abs(splitTotal - saleTotal)

  function addSplit() {
    const n = splits.length + 1
    setSplits(prev => {
      const even = (saleTotal / n).toFixed(2)
      return [...prev.map(s => ({ ...s, amount: even })), { id: String(Date.now()), label: `Person ${n}`, amount: even, tip: '0' }]
    })
  }

  function removeSplit(id: string) {
    setSplits(prev => {
      const next = prev.filter(s => s.id !== id)
      if (next.length < 2) return prev
      const even = (saleTotal / next.length).toFixed(2)
      return method === 'even' ? next.map(s => ({ ...s, amount: even })) : next
    })
  }

  function rebalanceEven() {
    const perPerson = saleTotal / splits.length
    setSplits(prev => prev.map((s, i) => ({
      ...s,
      amount: i === prev.length - 1
        ? (saleTotal - perPerson * (prev.length - 1)).toFixed(2)
        : perPerson.toFixed(2),
    })))
  }

  async function saveManual() {
    if (diff > 0.05) { setError(`Totals must equal A$${saleTotal.toFixed(2)} (off by A$${diff.toFixed(2)})`); return }
    setSaving(true); setError('')
    try {
      const payload = {
        sale_id: resolvedSaleId,
        splits: splits.map(s => ({
          split_method: method,
          person_label: s.label,
          subtotal: parseFloat(s.amount) || 0,
          tax_amount: saleTax / splits.length,
          tip_amount: parseFloat(s.tip) || 0,
          total_amount: (parseFloat(s.amount) || 0) + (parseFloat(s.tip) || 0),
        })),
      }
      const res = await fetch('/api/pos/splits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }
      await promoteAndSave()
    } finally { setSaving(false) }
  }

  async function loadGroups() {
    if (groupsLoaded) return
    const d = await fetch('/api/pos/split-groups').then(r => r.json()).catch(() => ({ groups: [] }))
    setGroups(d.groups ?? [])
    setGroupsLoaded(true)
  }

  async function selectGroup(g: any) {
    setSelectedGroup(g)
    const d = await fetch(`/api/pos/split-groups/${g.id}`).then(r => r.json()).catch(() => ({}))
    setGroupMembers(d.members ?? g.split_group_members ?? [])
    setSelectedMemberIds(new Set((d.members ?? g.split_group_members ?? []).map((m: any) => m.id)))
  }

  async function saveFromGroup() {
    if (!selectedGroup || selectedMemberIds.size < 2) { setError('Select at least 2 members'); return }
    setSaving(true); setError('')
    try {
      const members = groupMembers.filter(m => selectedMemberIds.has(m.id))
      const perPerson = saleTotal / members.length
      const payload = {
        sale_id: resolvedSaleId,
        group_id: selectedGroup.id,
        splits: members.map((m, i) => ({
          split_method: 'even',
          person_label: m.name,
          group_member_id: m.id,
          subtotal: i === members.length - 1 ? saleTotal - perPerson * (members.length - 1) : perPerson,
          tax_amount: saleTax / members.length,
          tip_amount: 0,
          total_amount: i === members.length - 1 ? saleTotal - perPerson * (members.length - 1) : perPerson,
        })),
      }
      const res = await fetch('/api/pos/splits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }
      await promoteAndSave()
    } finally { setSaving(false) }
  }

  async function runOcr(file: File) {
    setOcrLoading(true)
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = e => res((e.target?.result as string).split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      const d = await fetch('/api/pos/splits/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: b64, image_mime_type: file.type }),
      }).then(r => r.json())
      setOcrItems(d.items ?? [])
      setOcrTotal(d.total ?? null)
      setOcrScanId(d.scan_id ?? null)
    } catch { setError('OCR failed') }
    setOcrLoading(false)
  }

  async function convertOcrToSale() {
    if (!ocrScanId) return
    setSaving(true)
    try {
      const d = await fetch('/api/pos/splits/ocr/from-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scan_id: ocrScanId }) }).then(r => r.json())
      if (d.error) { setError(d.error); return }
      alert(`Created draft sale ${d.sale_number} — open it in Sales to split`)
      await voidDraftAndClose()
    } finally { setSaving(false) }
  }

  async function getAiSplit() {
    const names = aiMembers.split(',').map(n => n.trim()).filter(Boolean)
    if (names.length < 2) { setError('Enter at least 2 member names, comma-separated'); return }
    setAiLoading(true); setError('')
    try {
      const d = await fetch('/api/pos/splits/ai-suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: resolvedSaleId, members: names.map(name => ({ name })) }),
      }).then(r => r.json())
      setAiResult(d)
    } catch { setError('AI suggestion failed') } finally { setAiLoading(false) }
  }

  async function confirmAiSplit() {
    if (!aiResult?.splits) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/pos/splits/ai-suggest/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: resolvedSaleId, ai_response: aiResult }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }
      await promoteAndSave()
    } finally { setSaving(false) }
  }

  // ── Bootstrap guards ───────────────────────────────────────────────
  if (bootstrapping) {
    return (
      <div style={OVERLAY}>
        <div style={{ ...PANEL, alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Starting split…</p>
        </div>
      </div>
    )
  }

  if (bootstrapError) {
    return (
      <div style={OVERLAY}>
        <div style={{ ...PANEL, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, minHeight: 200 }}>
          <p style={{ color: '#ef4444', fontSize: 14, textAlign: 'center' }}>{bootstrapError}</p>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div style={OVERLAY}>
      <div style={PANEL}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Split Bill</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>Total: A${saleTotal.toFixed(2)}</p>
          </div>
          <button onClick={voidDraftAndClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-tertiary)' }}>×</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--divider)', padding: '0 20px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setError(''); if (t.id === 'group') loadGroups() }}
              style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', borderBottom: tab === t.id ? '2px solid var(--violet)' : '2px solid transparent', color: tab === t.id ? 'var(--violet)' : 'var(--text-secondary)' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* TAB 1: Manual */}
          {tab === 'manual' && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {(['even', 'by_amount'] as SplitMethod[]).map(m => (
                  <button key={m} onClick={() => { setMethod(m); if (m === 'even') rebalanceEven() }}
                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, background: method === m ? 'var(--violet)' : 'var(--bg-base)', color: method === m ? '#fff' : 'var(--text-secondary)' }}>
                    {m === 'even' ? 'Even' : 'Custom'}
                  </button>
                ))}
              </div>

              {splits.map((s, i) => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input style={inp} value={s.label} onChange={e => setSplits(p => p.map(r => r.id === s.id ? { ...r, label: e.target.value } : r))} placeholder={`Person ${i + 1}`} />
                  <input style={{ ...inp, textAlign: 'right' }} type="number" step="0.01" value={s.amount} onChange={e => setSplits(p => p.map(r => r.id === s.id ? { ...r, amount: e.target.value } : r))} placeholder="0.00" disabled={method === 'even'} />
                  <input style={{ ...inp, textAlign: 'right' }} type="number" step="0.01" min="0" value={s.tip} onChange={e => setSplits(p => p.map(r => r.id === s.id ? { ...r, tip: e.target.value } : r))} placeholder="Tip" />
                  <button onClick={() => removeSplit(s.id)} style={{ background: 'none', border: 'none', color: 'var(--destructive)', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <button onClick={addSplit} style={{ padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--divider)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>+ Add person</button>
                <span style={{ fontSize: 12, color: diff > 0.05 ? '#ef4444' : '#22c55e', marginLeft: 'auto', fontWeight: 600 }}>
                  Total: A${splitTotal.toFixed(2)} {diff > 0.05 ? `(off A$${diff.toFixed(2)})` : '✓'}
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: OCR */}
          {tab === 'ocr' && (
            <div>
              <div style={{ border: '2px dashed var(--divider)', borderRadius: 12, padding: 32, textAlign: 'center', marginBottom: 16, cursor: 'pointer' }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault() }}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) runOcr(f) }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
                  {ocrLoading ? 'Scanning receipt…' : 'Drop image or click to upload'}
                </p>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) runOcr(f) }} />
              </div>

              {ocrItems.length > 0 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Detected items:</p>
                  {ocrItems.map((item: any, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--divider)' }}>
                      <span>{item.name} ×{item.qty}</span>
                      <span style={{ color: item.confidence > 0.8 ? '#22c55e' : item.confidence > 0.5 ? '#f59e0b' : '#ef4444' }}>A${(Number(item.total) || 0).toFixed(2)} ({Math.round((Number(item.confidence) || 0) * 100)}%)</span>
                    </div>
                  ))}
                  {ocrTotal && <p style={{ fontWeight: 700, textAlign: 'right', marginTop: 8 }}>Total: A${(Number(ocrTotal) || 0).toFixed(2)}</p>}
                  <button onClick={convertOcrToSale} disabled={saving} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Creating…' : 'Convert to splittable sale'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Group */}
          {tab === 'group' && (
            <div>
              {!selectedGroup ? (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Select a group:</p>
                  {groups.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No groups yet. Create one in Split Groups.</p>}
                  {groups.map(g => (
                    <div key={g.id} onClick={() => selectGroup(g)}
                      style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--divider)', marginBottom: 8, cursor: 'pointer', background: 'var(--bg-surface)' }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{(g.split_group_members ?? []).filter((m: any) => m.is_active).length} members · {g.total_visits ?? 0} visits</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <button onClick={() => setSelectedGroup(null)} style={{ background: 'none', border: 'none', color: 'var(--violet)', cursor: 'pointer', fontSize: 13, marginBottom: 12 }}>← Back</button>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{selectedGroup.name} — select members:</p>
                  {groupMembers.map(m => (
                    <div key={m.id} onClick={() => setSelectedMemberIds(prev => { const s = new Set(prev); s.has(m.id) ? s.delete(m.id) : s.add(m.id); return s })}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${selectedMemberIds.has(m.id) ? 'var(--violet)' : 'var(--divider)'}`, marginBottom: 6, cursor: 'pointer', background: selectedMemberIds.has(m.id) ? 'var(--violet-dim)' : 'var(--bg-surface)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.avatar_color ?? '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>{m.name[0]}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                        {(Number(m.current_balance) || 0) !== 0 && <div style={{ fontSize: 11, color: (Number(m.current_balance) || 0) > 0 ? '#22c55e' : '#ef4444' }}>{(Number(m.current_balance) || 0) > 0 ? `Owed A$${(Number(m.current_balance) || 0).toFixed(2)}` : `Owes A$${Math.abs(Number(m.current_balance) || 0).toFixed(2)}`}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AI */}
          {tab === 'ai' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Enter member names (comma-separated):</p>
              <input style={{ ...inp, marginBottom: 12 }} value={aiMembers} onChange={e => setAiMembers(e.target.value)} placeholder="Alice, Bob, Carol" />
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                Cart: {cartItems.length} items · A${saleTotal.toFixed(2)}
              </p>
              <button onClick={getAiSplit} disabled={aiLoading} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: aiLoading ? 0.6 : 1, marginBottom: 16 }}>
                {aiLoading ? '🤖 Thinking…' : '🤖 Get AI suggestion'}
              </button>

              {aiResult?.splits && (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>{aiResult.overall_reasoning}</p>
                  {aiResult.splits.map((sp: any, i: number) => (
                    <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{sp.person}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>A${(Number(sp.total ?? sp.subtotal) || 0).toFixed(2)}</span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>{sp.reasoning}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--divider)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={voidDraftAndClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          {tab === 'manual' && (
            <button onClick={saveManual} disabled={saving || diff > 0.05}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || diff > 0.05 ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save split'}
            </button>
          )}
          {tab === 'group' && selectedGroup && (
            <button onClick={saveFromGroup} disabled={saving || selectedMemberIds.size < 2}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Split evenly'}
            </button>
          )}
          {tab === 'ai' && aiResult?.splits && (
            <button onClick={confirmAiSplit} disabled={saving}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Accept AI split'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}