'use client';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';
import { useState, useEffect } from 'react';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const iStyle: React.CSSProperties = { background: 'var(--bg-base)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', width: '100%', fontFamily: 'inherit' };
const lStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' };

interface GiftCard {
  id: string; code: string; initial_balance: number; balance: number;
  recipient_name: string | null; status: string; created_at: string; expires_at: string | null; is_active: boolean;
}

export default function GiftCardsPage() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showIssue, setShowIssue] = useState(false);
  const [amount, setAmount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<GiftCard | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [checkCode, setCheckCode] = useState('');
  const [checkResult, setCheckResult] = useState<GiftCard | null>(null);
  const [checking, setChecking] = useState(false);

  const load = () => {
    fetch('/api/pos/gift-cards')
      .then(r => r.json())
      .then(d => { setCards(d.gift_cards ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  async function issueCard() {
    if (!amount || parseFloat(amount) <= 0) return;
    setIssuing(true);
    setIssueError(null);
    try {
      const res = await fetch('/api/pos/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          recipient_name: recipientName.trim() || null,
          expires_at: expiry || null,
        }),
      });
      const d = await res.json();
      if (d.gift_card) {
        setIssued(d.gift_card);
        setCards(c => [d.gift_card, ...c]);
        setAmount('');
        setRecipientName('');
        setExpiry('');
        setShowIssue(false);
      } else {
        setIssueError(d.error || 'Failed to issue gift card');
      }
    } catch (e) {
      setIssueError('Network error — please try again');
    }
    setIssuing(false);
  }

  async function checkBalance() {
    if (!checkCode.trim()) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch(`/api/pos/gift-cards?code=${encodeURIComponent(checkCode.trim().toUpperCase())}`);
      const d = await res.json();
      setCheckResult(d.gift_card ?? null);
    } catch { /* silent */ }
    setChecking(false);
  }

  async function deactivate(id: string) {
    await fetch(`/api/pos/gift-cards?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    setCards(c => c.map(gc => gc.id === id ? { ...gc, is_active: false, status: 'cancelled' } : gc));
  }

  const filtered = cards.filter(c => !search || c.code.toLowerCase().includes(search.toLowerCase()) || (c.recipient_name ?? '').toLowerCase().includes(search.toLowerCase()));
  const activeCount = cards.filter(c => c.is_active && c.status !== 'used' && c.status !== 'cancelled').length;
  const totalBalance = cards.filter(c => c.is_active).reduce((s, c) => s + (c.balance ?? 0), 0);

  function statusColor(gc: GiftCard) {
    if (!gc.is_active || gc.status === 'cancelled') return C.red;
    if (gc.status === 'used') return C.muted;
    if (gc.expires_at && new Date(gc.expires_at) < new Date()) return C.amber;
    return C.green;
  }
  function statusLabel(gc: GiftCard) {
    if (!gc.is_active || gc.status === 'cancelled') return 'Cancelled';
    if (gc.status === 'used') return 'Used';
    if (gc.expires_at && new Date(gc.expires_at) < new Date()) return 'Expired';
    return 'Active';
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <POSAriaInsight page="pos/gift-cards" />
      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Gift Cards</h1>
            <p style={{ fontSize: 12, color: C.muted }}>Issue and manage gift cards for customers</p>
          </div>
          <button onClick={() => { setShowIssue(true); setIssueError(null); }}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            + Issue Gift Card
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Active cards', value: activeCount },
            { label: 'Total issued', value: cards.length },
            { label: 'Outstanding balance', value: `A$${totalBalance.toFixed(2)}` },
          ].map(s => (
            <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px' }}>
              <p style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Issued toast */}
        {issued && (
          <div style={{ marginBottom: 14, borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <p style={{ fontSize: 13, color: C.green }}>
              Gift card issued! Code: <strong style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: C.text }}>{issued.code}</strong>
              {issued.recipient_name && <span style={{ color: C.muted }}> · {issued.recipient_name}</span>}
              {' '}· Balance: <strong>A${(issued.balance ?? issued.initial_balance).toFixed(2)}</strong>
            </p>
            <button onClick={() => setIssued(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>
        )}

        {/* Check balance */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Check Balance</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={checkCode} onChange={e => setCheckCode(e.target.value.toUpperCase())}
              placeholder="Enter gift card code…"
              style={{ ...iStyle, flex: 1, fontFamily: "'JetBrains Mono',monospace" }}
              onKeyDown={e => e.key === 'Enter' && checkBalance()} />
            <button onClick={checkBalance} disabled={checking || !checkCode.trim()}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: checking || !checkCode.trim() ? 0.5 : 1, flexShrink: 0 }}>
              {checking ? 'Checking…' : 'Check'}
            </button>
          </div>
          {checkResult && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(139,92,246,0.08)', borderRadius: 8, border: `1px solid rgba(139,92,246,0.2)` }}>
              <p style={{ fontSize: 13, color: C.text }}>Code: <strong style={{ fontFamily: "'JetBrains Mono',monospace" }}>{checkResult.code}</strong></p>
              <p style={{ fontSize: 13, color: C.text }}>Balance: <strong style={{ color: C.violet }}>A${(checkResult.balance ?? 0).toFixed(2)}</strong> / A${(checkResult.initial_balance ?? 0).toFixed(2)}</p>
              <p style={{ fontSize: 12, color: statusColor(checkResult) }}>{statusLabel(checkResult)}</p>
            </div>
          )}
          {checkResult === null && checkCode && !checking && (
            <p style={{ marginTop: 8, fontSize: 12, color: C.red }}>No gift card found with that code.</p>
          )}
        </div>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by code or recipient…"
          style={{ ...iStyle, marginBottom: 12 }} />

        {/* Table */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                {['Code', 'Recipient', 'Initial', 'Balance', 'Issued', 'Expires', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '40px 14px', textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>No gift cards yet</p>
                  <p style={{ fontSize: 12, color: C.muted }}>Click &quot;Issue Gift Card&quot; to get started.</p>
                </td></tr>
              ) : filtered.map((card, i) => (
                <tr key={card.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, color: C.text }}>{card.code}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: C.muted }}>{card.recipient_name || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: C.muted, fontFamily: "'JetBrains Mono',monospace" }}>A${(card.initial_balance ?? 0).toFixed(2)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>A${(card.balance ?? 0).toFixed(2)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: C.muted }}>{new Date(card.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: C.muted }}>{card.expires_at ? new Date(card.expires_at).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, fontWeight: 700, background: `${statusColor(card)}18`, color: statusColor(card), border: `1px solid ${statusColor(card)}30` }}>
                      {statusLabel(card)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {card.is_active && card.status !== 'cancelled' && (
                      <button onClick={() => { if (confirm('Deactivate this gift card?')) deactivate(card.id); }}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.07)', color: C.red, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Issue modal */}
        {showIssue && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
            <div style={{ background: '#0F0D1C', border: `1px solid ${C.border}`, borderRadius: 18, width: '100%', maxWidth: 400, padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Issue Gift Card</h3>
                <button onClick={() => { setShowIssue(false); setIssueError(null); }}
                  style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lStyle}>Amount (A$) *</label>
                  <input type="number" min={1} step={0.01} value={amount} onChange={e => setAmount(e.target.value)}
                    style={iStyle} placeholder="50.00" autoFocus />
                </div>
                <div>
                  <label style={lStyle}>Recipient Name (optional)</label>
                  <input type="text" value={recipientName} onChange={e => setRecipientName(e.target.value)}
                    style={iStyle} placeholder="e.g. Jane Smith" />
                </div>
                <div>
                  <label style={lStyle}>Expiry Date (optional)</label>
                  <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)}
                    style={iStyle} />
                </div>
                <p style={{ fontSize: 11, color: C.dim }}>A unique code (e.g. AB12CD34) will be auto-generated and shown after issuing.</p>
              </div>
              {issueError && (
                <p style={{ marginTop: 12, fontSize: 12, color: C.red, background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: '8px 12px' }}>{issueError}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button onClick={() => { setShowIssue(false); setIssueError(null); }}
                  style={{ flex: 1, padding: '10px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={issueCard} disabled={issuing || !amount || parseFloat(amount) <= 0}
                  style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: issuing || !amount || parseFloat(amount) <= 0 ? 0.5 : 1 }}>
                  {issuing ? 'Issuing…' : 'Issue Gift Card'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
