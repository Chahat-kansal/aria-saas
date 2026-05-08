'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/analytics';

const PROMO_TYPES = ['Percent off', 'Fixed off', 'Bundle price', 'Buy X get Y', 'Mix & match'];
const CONDITION_TYPES = ['All products', 'Category', 'Brand', 'Specific products'];
const CUSTOMER_TYPES = ['All customers', 'Group', 'Segment'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STEP_LABELS = ['Type', 'Conditions', 'Schedule', 'Customers', 'Review'];

const iS: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '7px 11px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' };
const tBtn = (active: boolean): React.CSSProperties => ({ padding: '7px 14px', borderRadius: 7, border: '1px solid', borderColor: active ? 'var(--violet)' : 'var(--border-default)', background: active ? 'var(--violet-dim)' : 'var(--bg-elevated)', color: active ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

export default function NewPromotionPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', type: PROMO_TYPES[0], rate: '10', conditions: 'All products', conditionValue: '',
    startsAt: new Date().toISOString().split('T')[0], endsAt: '',
    days: DAYS.map((_, i) => i), hours: [] as number[], customerType: 'All customers', customerValue: '', active: true,
  });

  function upd(field: string, value: unknown) { setForm(f => ({ ...f, [field]: value })); }

  async function save() {
    setSaving(true);
    const rule: Record<string, unknown> = { type: form.type, rate: Number(form.rate), conditions: form.conditions, conditionValue: form.conditionValue };
    await fetch('/api/pos/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      name: form.name || `${form.type} — ${form.rate}${form.type === 'Percent off' ? '%' : '$'} off`,
      rule_jsonb: rule,
      starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      days_of_week: form.days,
      customer_eligibility: form.customerType.toLowerCase().replace(' ', '_'),
      active: form.active,
    }) }).catch(() => {});
    track('promotion_created', { type: form.type });
    setSaving(false);
    router.push('/pos/promotions');
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      {/* Progress bar */}
      <div style={{ padding: '16px 28px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', gap: 0, maxWidth: 700 }}>
          {STEP_LABELS.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < 4 ? 1 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: step > i + 1 ? 'pointer' : 'default' }} onClick={() => { if (step > i + 1) setStep(i + 1); }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: step > i + 1 ? '#34D399' : step === i + 1 ? 'var(--violet)' : 'var(--bg-elevated)', color: step > i + 1 ? '#fff' : step === i + 1 ? '#fff' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 12, color: step === i + 1 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: step === i + 1 ? 700 : 400, whiteSpace: 'nowrap' }}>{label}</span>
              </div>
              {i < 4 && <div style={{ flex: 1, height: 2, background: step > i + 1 ? '#34D399' : 'var(--bg-overlay)', margin: '0 8px' }} />}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 28, maxWidth: 680 }}>
        {/* STEP 1 — Type */}
        {step === 1 && (<>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Promotion type</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>What kind of deal is this?</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, marginBottom: 24 }}>
            {PROMO_TYPES.map(t => (
              <div key={t} onClick={() => upd('type', t)} style={{ background: form.type === t ? 'var(--violet-dim)' : 'var(--bg-surface)', border: `2px solid ${form.type === t ? 'var(--violet)' : 'transparent'}`, borderRadius: 12, padding: '16px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: form.type === t ? 'var(--violet)' : 'var(--text-primary)' }}>
                🎯 {t}
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Promotion name (optional)</label>
            <input value={form.name} onChange={e => upd('name', e.target.value)} placeholder={`${form.type} — ${form.rate}% off`} style={{ ...iS, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{form.type === 'Percent off' ? 'Discount %' : 'Discount A$'}</label>
            <input type="number" value={form.rate} onChange={e => upd('rate', e.target.value)} style={{ ...iS, width: 120 }} />
          </div>
          <button onClick={() => setStep(2)} style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Continue →</button>
        </>)}

        {/* STEP 2 — Conditions */}
        {step === 2 && (<>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Conditions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {CONDITION_TYPES.map(c => (
              <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" name="cond" checked={form.conditions === c} onChange={() => upd('conditions', c)} style={{ accentColor: 'var(--violet)' }} />
                {c}
              </label>
            ))}
          </div>
          {form.conditions !== 'All products' && (
            <input value={form.conditionValue} onChange={e => upd('conditionValue', e.target.value)} placeholder={`Search ${form.conditions.toLowerCase()}…`} style={{ ...iS, width: '100%', boxSizing: 'border-box', marginBottom: 20 }} />
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)} style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
            <button onClick={() => setStep(3)} style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Continue →</button>
          </div>
        </>)}

        {/* STEP 3 — Schedule */}
        {step === 3 && (<>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Schedule</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Starts</label>
              <input type="date" value={form.startsAt} onChange={e => upd('startsAt', e.target.value)} style={iS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Ends (optional)</label>
              <input type="date" value={form.endsAt} onChange={e => upd('endsAt', e.target.value)} style={iS} />
            </div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Days of week</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DAYS.map((d, i) => (
                <button key={d} style={tBtn(form.days.includes(i))} onClick={() => upd('days', form.days.includes(i) ? form.days.filter(x => x !== i) : [...form.days, i])}>{d}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(2)} style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
            <button onClick={() => setStep(4)} style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Continue →</button>
          </div>
        </>)}

        {/* STEP 4 — Customer eligibility */}
        {step === 4 && (<>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Customer eligibility</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {CUSTOMER_TYPES.map(c => (
              <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" name="cust" checked={form.customerType === c} onChange={() => upd('customerType', c)} style={{ accentColor: 'var(--violet)' }} />
                {c}
              </label>
            ))}
          </div>
          {form.customerType !== 'All customers' && (
            <input value={form.customerValue} onChange={e => upd('customerValue', e.target.value)} placeholder={`Select ${form.customerType.toLowerCase()}…`} style={{ ...iS, width: '100%', boxSizing: 'border-box', marginBottom: 20 }} />
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(3)} style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
            <button onClick={() => setStep(5)} style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Review →</button>
          </div>
        </>)}

        {/* STEP 5 — Review */}
        {step === 5 && (<>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Review & Activate</h2>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: 22, marginBottom: 24 }}>
            {[
              ['Name', form.name || `${form.type} — ${form.rate}${form.type === 'Percent off' ? '%' : '$'} off`],
              ['Type', form.type],
              ['Discount', `${form.rate}${form.type === 'Percent off' ? '%' : '$'} off`],
              ['Conditions', form.conditions + (form.conditionValue ? `: ${form.conditionValue}` : '')],
              ['Starts', form.startsAt || 'Immediately'],
              ['Ends', form.endsAt || 'No end date'],
              ['Days', form.days.map(d => DAYS[d]).join(', ')],
              ['Customers', form.customerType],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--divider)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(4)} style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
            <button onClick={save} disabled={saving} style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: saving ? 'var(--bg-elevated)' : '#34D399', color: saving ? 'var(--text-secondary)' : '#000', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : '✓ Activate Promotion'}
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}
