'use client';
import { useState, useEffect, useRef } from 'react';

interface KDSItem {
  name: string;
  qty: number;
  modifiers?: string[];
  special_instructions?: string;
  course?: string;
}

interface KDSOrder {
  id: string;
  table_label: string | null;
  ticket_number: number | null;
  items: KDSItem[];
  status: 'new' | 'in_progress' | 'ready' | 'delivered' | 'void';
  created_at: string;
  bumped_at: string | null;
}

function elapsedSeconds(created_at: string) {
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 1000);
}

function formatElapsed(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function urgencyColor(secs: number): string {
  if (secs < 300) return '#16a34a';
  if (secs < 600) return '#d97706';
  return '#dc2626';
}

function urgencyBg(secs: number): string {
  if (secs < 300) return 'rgba(22,163,74,0.08)';
  if (secs < 600) return 'rgba(217,119,6,0.1)';
  return 'rgba(220,38,38,0.12)';
}

const STATUS_ACTIONS: Record<string, { next: KDSOrder['status']; label: string; color: string }> = {
  new:         { next: 'in_progress', label: 'START',  color: '#2563eb' },
  in_progress: { next: 'ready',       label: 'READY',  color: '#16a34a' },
  ready:       { next: 'delivered',   label: 'BUMP',   color: '#6b7280' },
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [updating, setUpdating] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  async function fetchOrders() {
    try {
      const res = await fetch('/api/pos/kds');
      if (res.ok) {
        const d = await res.json();
        setOrders(d.orders ?? []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }

  useEffect(() => {
    fetchOrders();
    // Poll every 5 seconds
    pollRef.current = setInterval(fetchOrders, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  // Tick every second for the elapsed timer
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function advanceStatus(order: KDSOrder) {
    const action = STATUS_ACTIONS[order.status];
    if (!action) return;
    setUpdating(order.id);
    try {
      await fetch(`/api/pos/kds/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action.next }),
      });
      await fetchOrders();
    } catch { /* silent */ }
    setUpdating(null);
  }

  async function voidOrder(id: string) {
    setUpdating(id);
    try {
      await fetch(`/api/pos/kds/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'void' }),
      });
      await fetchOrders();
    } catch { /* silent */ }
    setUpdating(null);
  }

  const active = orders.filter(o => o.status !== 'delivered' && o.status !== 'void');
  const avgWait = active.length > 0
    ? Math.floor(active.reduce((s, o) => s + elapsedSeconds(o.created_at), 0) / active.length)
    : 0;

  const statusBorder: Record<string, string> = {
    new: '2px solid #e5e7eb',
    in_progress: '2px solid #2563eb',
    ready: '2px solid #16a34a',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top bar */}
      <div style={{ background: '#1a1a1a', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#1D9E75', fontWeight: 700, fontSize: 18 }}>KITCHEN</span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
            {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase' }}>Active orders</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 22 }}>{active.length}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase' }}>Avg wait</div>
            <div style={{ color: avgWait > 600 ? '#ef4444' : avgWait > 300 ? '#f59e0b' : '#22c55e', fontWeight: 700, fontSize: 22 }}>
              {formatElapsed(avgWait)}
            </div>
          </div>
        </div>
        <a href="/pos/terminal" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textDecoration: 'none' }}>
          ← Back to POS
        </a>
      </div>

      {/* Status legend */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 20px', display: 'flex', gap: 20 }}>
        {[
          { color: '#e5e7eb', label: 'New' },
          { color: '#2563eb', label: 'In progress' },
          { color: '#16a34a', label: 'Ready' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: s.color }} />
            {s.label}
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
          <span style={{ color: '#16a34a' }}>●</span> &lt;5min
          {' · '}
          <span style={{ color: '#d97706' }}>●</span> 5–10min
          {' · '}
          <span style={{ color: '#dc2626' }}>●</span> 10min+
        </div>
      </div>

      {/* Orders grid */}
      <div style={{ padding: 16 }}>
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: '#fff', borderRadius: 12, height: 200, animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        )}

        {!loading && active.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9ca3af' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#374151', marginBottom: 4 }}>All clear</p>
            <p style={{ fontSize: 14 }}>No active orders. New orders will appear here automatically.</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {active.map(order => {
            const elapsed = elapsedSeconds(order.created_at);
            const action = STATUS_ACTIONS[order.status];
            const isUpdating = updating === order.id;

            return (
              <div key={order.id} style={{
                background: '#fff',
                borderRadius: 12,
                border: statusBorder[order.status] ?? '2px solid #e5e7eb',
                overflow: 'hidden',
                boxShadow: order.status === 'ready' ? '0 0 0 3px rgba(22,163,74,0.2)' : 'none',
              }}>
                {/* Card header */}
                <div style={{
                  padding: '10px 14px',
                  background: urgencyBg(elapsed),
                  borderBottom: '1px solid #f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <span style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>
                      #{order.ticket_number ?? '—'}
                    </span>
                    {order.table_label && (
                      <span style={{ marginLeft: 8, fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
                        {order.table_label}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: urgencyColor(elapsed) }}>
                      {formatElapsed(elapsed)}
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>
                      {new Date(order.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div style={{ padding: '10px 14px', minHeight: 80 }}>
                  {order.items.map((item, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 800, fontSize: 16, color: '#111827', minWidth: 24 }}>
                          {item.qty}×
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{item.name}</span>
                        {item.course && item.course !== 'main' && (
                          <span style={{ fontSize: 10, background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, color: '#6b7280' }}>
                            {item.course}
                          </span>
                        )}
                      </div>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div style={{ marginLeft: 32, fontSize: 12, color: '#6b7280' }}>
                          {item.modifiers.join(' · ')}
                        </div>
                      )}
                      {item.special_instructions && (
                        <div style={{ marginLeft: 32, fontSize: 12, color: '#dc2626', fontStyle: 'italic' }}>
                          ⚑ {item.special_instructions}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ padding: '10px 14px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
                  {action && (
                    <button
                      onClick={() => advanceStatus(order)}
                      disabled={isUpdating}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                        background: action.color, color: '#fff',
                        fontWeight: 800, fontSize: 14, cursor: isUpdating ? 'wait' : 'pointer',
                        opacity: isUpdating ? 0.6 : 1,
                      }}>
                      {isUpdating ? '…' : action.label}
                    </button>
                  )}
                  <button
                    onClick={() => voidOrder(order.id)}
                    disabled={isUpdating}
                    style={{
                      padding: '10px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                      background: '#fff', color: '#9ca3af', fontWeight: 600, fontSize: 12,
                      cursor: isUpdating ? 'wait' : 'pointer',
                    }}>
                    VOID
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
