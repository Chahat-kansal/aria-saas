'use client';
import { useState, useEffect } from 'react';

const C = { card: '#0A0E1A', border: 'rgba(0,229,255,0.08)', text: '#E8F4F8', muted: 'rgba(130,160,200,0.7)', dim: 'rgba(130,160,200,0.35)', cyan: '#00E5FF', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const PLANS = ['free','pro','enterprise'] as const;

function PlanToggle({ plan, active, onChange }: { plan: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!active)} style={{ padding: '3px 10px', borderRadius: 99, border: `1px solid ${active ? C.cyan : C.border}`, background: active ? 'rgba(0,229,255,0.12)' : 'transparent', color: active ? C.cyan : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', transition: 'all 150ms' }}>
      {plan}
    </button>
  );
}

export default function FeaturesPage() {
  const [flags, setFlags]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/feature-flags').then(r => r.json()).then(d => {
      setFlags(d.flags || []); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function updateFlag(flag_key: string, updates: object) {
    setSaving(flag_key);
    const res = await fetch(`/api/admin/feature-flags?flag_key=${flag_key}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    const d = await res.json();
    if (d.flag) setFlags(prev => prev.map(f => f.flag_key === flag_key ? d.flag : f));
    setSaving(null);
  }

  function togglePlan(flag: any, plan: string, active: boolean) {
    const plans: string[] = flag.enabled_for_plans || [];
    const next = active ? [...plans, plan] : plans.filter((p: string) => p !== plan);
    updateFlag(flag.flag_key, { enabled_for_plans: next });
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Feature Flags</h1>
        <p style={{ fontSize: 13, color: C.muted }}>Control which features are available per plan or per business</p>
      </div>

      {loading ? <p style={{ color: C.muted }}>Loading…</p> : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                {['Feature','Description','Free','Pro','Enterprise','Global','Saving'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flags.map((flag, i) => (
                <tr key={flag.flag_key} style={{ borderBottom: i < flags.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{flag.label}</p>
                    <p style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace' }}>{flag.flag_key}</p>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: C.muted, maxWidth: 200 }}>{flag.description || '—'}</td>
                  {PLANS.map(plan => (
                    <td key={plan} style={{ padding: '12px 14px' }}>
                      <PlanToggle plan={plan} active={(flag.enabled_for_plans || []).includes(plan)} onChange={v => togglePlan(flag, plan, v)} />
                    </td>
                  ))}
                  <td style={{ padding: '12px 14px' }}>
                    <button onClick={() => updateFlag(flag.flag_key, { is_globally_enabled: !flag.is_globally_enabled })}
                      style={{ padding: '4px 12px', borderRadius: 99, border: `1px solid ${flag.is_globally_enabled ? C.green : C.border}`, background: flag.is_globally_enabled ? 'rgba(34,197,94,0.12)' : 'transparent', color: flag.is_globally_enabled ? C.green : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {flag.is_globally_enabled ? '✓ All' : 'Off'}
                    </button>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {saving === flag.flag_key ? <span style={{ fontSize: 10, color: C.cyan }}>Saving…</span> : null}
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
