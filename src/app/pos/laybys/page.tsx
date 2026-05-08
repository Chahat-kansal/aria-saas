'use client';
import { useState, useEffect, useCallback } from 'react';
import { track } from '@/lib/analytics';

interface Layby {
  id: string; customer_id: string; deposit_cents: number; paid_cents: number;
  total_cents: number; due_date: string | null; status: string; notes: string | null;
  created_at: string; customers?: { name: string; phone: string | null } | null;
}

const STATUS_COLORS: Record<string, string> = { active: '#60A5FA', completed: '#34D399', cancelled: '#F87171' };
const tBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: active ? 'var(--violet)' : 'var(--border-default)', background: active ? 'var(--violet-dim)' : 'var(--bg-elevated)', color: active ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

export default function LaybysPage() {
  const [laybys, setLaybys] = useState<Layby[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [selected, setSelected] = useState<Layby | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/pos/laybys?status=${statusFilter}`).then(r => r.json()).then(d => {
      setLaybys(d.laybys ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: string) {
    await fetch('/api/pos/laybys', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}) }) });
    load();
    setSelected(null);
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Laybys</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Parked sales awaiting full payment</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['active', 'completed', 'cancelled', 'all'] as const).map(s => (
            <button key={s} style={tBtn(statusFilter === s)} onClick={() => setStatusFilter(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['CUSTOMER','TOTAL','DEPOSIT','BALANCE','DUE DATE','STATUS',''].map(h => (
                <th key={h} style={{ padding: '10px 14px', background: '#29b6f6', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                  {Array.from({ length: 7 }).map((_, j) => <td key={j} style={{ padding: '10px 14px' }}><div style={{ height: 12, background: 'var(--bg-overlay)', borderRadius: 4, width: '70%' }} /></td>)}
                </tr>
              ))
            ) : laybys.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🛍️</div>
                No {statusFilter === 'all' ? '' : statusFilter} laybys found.
              </td></tr>
            ) : laybys.map((l, i) => {
              const total = l.total_cents / 100;
              const deposit = l.deposit_cents / 100;
              const paid = l.paid_cents / 100;
              const balance = total - paid;
              const overdue = l.due_date && new Date(l.due_date) < new Date() && l.status === 'active';
              return (
                <tr key={l.id} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)', cursor: 'pointer' }} onClick={() => setSelected(l)}>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>{(l.customers as any)?.name ?? 'Unknown'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>A${total.toFixed(2)}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace', color: '#34D399" }}>A${deposit.toFixed(2)}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace", color: balance > 0 ? '#FBBF24' : '#34D399', fontWeight: 700 }}>A${balance.toFixed(2)}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: overdue ? '#F87171' : 'var(--text-secondary)' }}>{l.due_date ? new Date(l.due_date).toLocaleDateString('en-AU') : '—'}{overdue ? ' ⚠️' : ''}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: `${STATUS_COLORS[l.status] ?? '#94A3B8'}22`, color: STATUS_COLORS[l.status] ?? '#94A3B8', fontWeight: 700 }}>{l.status}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {l.status === 'active' && (
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => updateStatus(l.id, 'completed')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#34D399', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Complete</button>
                        <button onClick={() => updateStatus(l.id, 'cancelled')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(248,113,113,0.14)', color: '#F87171', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={() => setSelected(null)} />
          <div style={{ width: 380, background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-lg)', padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Layby Detail</span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Customer', (selected.customers as any)?.name ?? '—'],
                ['Total', `A$${(selected.total_cents / 100).toFixed(2)}`],
                ['Deposit', `A$${(selected.deposit_cents / 100).toFixed(2)}`],
                ['Paid', `A$${(selected.paid_cents / 100).toFixed(2)}`],
                ['Balance', `A$${((selected.total_cents - selected.paid_cents) / 100).toFixed(2)}`],
                ['Due', selected.due_date ? new Date(selected.due_date).toLocaleDateString('en-AU') : '—'],
                ['Status', selected.status],
                ['Created', new Date(selected.created_at).toLocaleDateString('en-AU')],
                ['Notes', selected.notes ?? '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            {selected.status === 'active' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button onClick={() => updateStatus(selected.id, 'completed')} style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', background: '#34D399', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Complete</button>
                <button onClick={() => updateStatus(selected.id, 'cancelled')} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #F87171', background: 'transparent', color: '#F87171', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
