'use client'
import { useState, useEffect } from 'react'
import SettleIouModal from '@/components/pos/SettleIouModal'
import DisputeIouModal from '@/components/pos/DisputeIouModal'

type Tab = 'members' | 'history' | 'ious' | 'settings'

export default function SplitGroupDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const [tab, setTab] = useState<Tab>('members')
  const [group, setGroup] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [ious, setIous] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [settleIou, setSettleIou] = useState<any | null>(null)
  const [disputeIou, setDisputeIou] = useState<any | null>(null)
  const [simplifying, setSimplifying] = useState(false)
  const [simplifyResult, setSimplifyResult] = useState<any | null>(null)
  const [addMemberName, setAddMemberName] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [editName, setEditName] = useState('')
  const [savingName, setSavingName] = useState(false)

  const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

  async function load() {
    setLoading(true)
    const [gd, hd] = await Promise.all([
      fetch(`/api/pos/split-groups/${id}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/pos/split-groups/${id}/history`).then(r => r.json()).catch(() => ({ history: [] })),
    ])
    setGroup(gd.group ?? null)
    setMembers(gd.members ?? [])
    setIous(gd.open_ious ?? [])
    setHistory(hd.history ?? [])
    setEditName(gd.group?.name ?? '')
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  async function addMember() {
    if (!addMemberName.trim()) return
    setAddingMember(true)
    await fetch(`/api/pos/split-groups/${id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: addMemberName.trim() }) })
    setAddMemberName('')
    load()
    setAddingMember(false)
  }

  async function removeMember(memberId: string) {
    await fetch(`/api/pos/split-groups/${id}/members/${memberId}`, { method: 'DELETE' })
    load()
  }

  async function simplify() {
    setSimplifying(true)
    const d = await fetch('/api/pos/split-ious/simplify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: id }) }).then(r => r.json()).catch(() => ({}))
    setSimplifyResult(d)
    load()
    setSimplifying(false)
  }

  async function saveName() {
    if (!editName.trim()) return
    setSavingName(true)
    await fetch(`/api/pos/split-groups/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName.trim() }) })
    load()
    setSavingName(false)
  }

  async function deleteGroup() {
    if (!confirm('Archive this group? It can be restored from the database.')) return
    await fetch(`/api/pos/split-groups/${id}`, { method: 'DELETE' })
    window.location.href = '/pos/split-groups'
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
  if (!group) return <div style={{ padding: 32, color: 'var(--text-tertiary)', fontSize: 13 }}>Group not found.</div>

  const TABS: { id: Tab; label: string }[] = [{ id: 'members', label: 'Members' }, { id: 'history', label: 'History' }, { id: 'ious', label: `IOUs (${ious.length})` }, { id: 'settings', label: 'Settings' }]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 820, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      {settleIou && <SettleIouModal iou={settleIou} onDone={() => { setSettleIou(null); load() }} onClose={() => setSettleIou(null)} />}
      {disputeIou && <DisputeIouModal iou={disputeIou} onDone={() => { setDisputeIou(null); load() }} onClose={() => setDisputeIou(null)} />}

      <div style={{ marginBottom: 24 }}>
        <a href="/pos/split-groups" style={{ fontSize: 12, color: 'var(--violet)', textDecoration: 'none' }}>← Groups</a>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '6px 0 2px' }}>{group.name}</h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{members.length} members · {Number(group.total_visits) || 0} visits · A${(Number(group.total_spend) || 0).toFixed(2)} total</p>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--divider)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, borderBottom: tab === t.id ? '2px solid var(--violet)' : '2px solid transparent', color: tab === t.id ? 'var(--violet)' : 'var(--text-secondary)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Members tab */}
      {tab === 'members' && (
        <div>
          <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['Name', 'Balance', 'Total paid', 'Total owed', ''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--divider)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                    <td style={{ padding: '10px 14px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.avatar_color ?? 'var(--violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>{m.name[0]}</div>
                      {m.name}
                    </div></td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: (Number(m.current_balance) || 0) > 0 ? '#22c55e' : (Number(m.current_balance) || 0) < 0 ? '#ef4444' : 'var(--text-tertiary)' }}>
                      {(Number(m.current_balance) || 0) === 0 ? 'Settled' : `A$${Math.abs(Number(m.current_balance) || 0).toFixed(2)} ${(Number(m.current_balance) || 0) > 0 ? 'owed' : 'owes'}`}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>A${(Number(m.total_paid_to_date) || 0).toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>A${(Number(m.total_owed_to_date) || 0).toFixed(2)}</td>
                    <td style={{ padding: '10px 14px' }}><button onClick={() => removeMember(m.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inp, maxWidth: 240 }} value={addMemberName} onChange={e => setAddMemberName(e.target.value)} placeholder="New member name" onKeyDown={e => e.key === 'Enter' && addMember()} />
            <button onClick={addMember} disabled={addingMember || !addMemberName.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: addingMember ? 0.6 : 1 }}>
              {addingMember ? 'Adding…' : '+ Add'}
            </button>
          </div>
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div>
          {history.length === 0 ? <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No visits yet.</p> : history.map((visit: any, i) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{new Date(visit.visit_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>A${(Number(visit.total) || 0).toFixed(2)}</span>
              </div>
              {(visit.splits ?? []).map((sp: any) => (
                <div key={sp.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>
                  <span>{sp.person_label}</span>
                  <span style={{ color: sp.status === 'paid' ? '#22c55e' : 'var(--text-secondary)' }}>A${(Number(sp.total_amount) || 0).toFixed(2)} · {sp.status}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* IOUs tab */}
      {tab === 'ious' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Open IOUs ({ious.length})</h3>
            <button onClick={simplify} disabled={simplifying || ious.length < 2} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--violet)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: simplifying ? 0.6 : 1 }}>
              {simplifying ? 'Simplifying…' : '⚡ Simplify debts'}
            </button>
          </div>

          {simplifyResult && (
            <div style={{ background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#7FB897' }}>
              Simplified {simplifyResult.before_count} IOUs → {simplifyResult.after_count} (saved {simplifyResult.savings} transactions)
            </div>
          )}

          {ious.length === 0 ? <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No open IOUs. All settled!</p> : ious.map((iou: any) => (
            <div key={iou.id} style={{ background: 'var(--bg-surface)', border: `1px solid ${iou.status === 'disputed' ? '#f59e0b40' : 'var(--divider)'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{iou.from_name} → {iou.to_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>A${(Number(iou.amount) || 0).toFixed(2)} · {iou.status}</div>
                {iou.dispute_reason && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>⚠ {iou.dispute_reason}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {iou.status === 'pending' && <>
                  <button onClick={() => setSettleIou(iou)} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#22c55e20', color: '#22c55e', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Settle</button>
                  <button onClick={() => setDisputeIou(iou)} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#f59e0b20', color: '#f59e0b', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Dispute</button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && (
        <div style={{ maxWidth: 440 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Group name</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <input style={inp} value={editName} onChange={e => setEditName(e.target.value)} />
            <button onClick={saveName} disabled={savingName || !editName.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
          <button onClick={deleteGroup} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--destructive)', background: 'transparent', color: 'var(--destructive)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Archive group
          </button>
        </div>
      )}
    </div>
  )
}
