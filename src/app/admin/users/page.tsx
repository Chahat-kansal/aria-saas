'use client';
import { useState, useEffect } from 'react';

const C = { card: '#0A0E1A', border: 'rgba(0,229,255,0.08)', text: '#E8F4F8', muted: 'rgba(130,160,200,0.7)', dim: 'rgba(130,160,200,0.35)', cyan: '#00E5FF', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };

export default function UsersPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    fetch('/api/admin/businesses').then(r => r.json()).then(d => {
      setBusinesses(d.businesses || []); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const iS = { background: '#080C10', border: `1px solid rgba(0,229,255,0.12)`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.text, outline: 'none', fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Users</h1>
        <p style={{ fontSize: 13, color: C.muted }}>{businesses.length} accounts</p>
      </div>

      {loading ? <p style={{ color: C.muted }}>Loading…</p> : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                {['Business','Industry','City','Plan','Joined','Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {businesses.map((b, i) => (
                <tr key={b.id} style={{ borderBottom: i < businesses.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>{b.name}</td>
                  <td style={{ padding: '10px 14px', color: C.muted, textTransform: 'capitalize' }}>{b.industry || '—'}</td>
                  <td style={{ padding: '10px 14px', color: C.muted }}>{b.city || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(130,160,200,0.1)', color: C.muted, fontWeight: 700 }}>{(b.plan || 'free').toUpperCase()}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: C.dim }}>{b.created_at ? new Date(b.created_at).toLocaleDateString('en-AU') : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <a href={`/admin/businesses/${b.id}`} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`, color: C.muted, textDecoration: 'none', marginRight: 6 }}>View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
