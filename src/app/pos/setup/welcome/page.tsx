'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/analytics';

const INDUSTRIES = ['Bottle shop / Liquor', 'Convenience store', 'Café / Coffee', 'Grocery', 'Other retail'];
const STEPS = 5;

const iS: React.CSSProperties = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '11px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 };

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ businessName: '', abn: '', industry: INDUSTRIES[0], outletName: '', address: '' });
  const [staff, setStaff] = useState<Array<{ name: string; email: string; role: string }>>([]);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'Cashier' });

  function upd(field: string, value: string) { setForm(f => ({ ...f, [field]: value })); }

  async function saveSetup() {
    setSaving(true);
    await fetch('/api/pos/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, staff }) }).catch(() => {});
    track('onboarding_step', { step: 5, completed: true });
    setSaving(false);
    router.push('/pos/terminal');
  }

  const progress = ((step - 1) / (STEPS - 1)) * 100;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        {/* Progress bar */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Step {step} of {STEPS}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{Math.round(progress)}% complete</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <div style={{ height: 4, borderRadius: 2, width: `${progress}%`, background: 'var(--violet)', transition: 'width 400ms' }} />
          </div>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 60, marginBottom: 20 }}>✨</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Welcome to Aria</h1>
            <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 40 }}>
              Let&apos;s get your shop running in 60 seconds. Aria sets up your store, imports your products, and starts learning your business.
            </p>
            <button onClick={() => { setStep(2); track('onboarding_step', { step: 1, completed: true }); }} style={{ padding: '14px 40px', borderRadius: 12, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Get started →
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Tell us about your shop</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28 }}>This helps Aria give you relevant insights from day one.</p>
            <input value={form.businessName} onChange={e => upd('businessName', e.target.value)} placeholder="Business name *" style={iS} />
            <input value={form.abn} onChange={e => upd('abn', e.target.value)} placeholder="ABN (optional)" style={iS} />
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Industry</label>
            <select value={form.industry} onChange={e => upd('industry', e.target.value)} style={{ ...iS, cursor: 'pointer' }}>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <input value={form.outletName} onChange={e => upd('outletName', e.target.value)} placeholder="Primary outlet name (e.g. Main Street Store)" style={iS} />
            <input value={form.address} onChange={e => upd('address', e.target.value)} placeholder="Address" style={iS} />
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => setStep(1)} style={{ padding: '12px 24px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
              <button onClick={() => { if (!form.businessName) { alert('Business name is required'); return; } setStep(3); track('onboarding_step', { step: 2, completed: true }); }} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Continue →</button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Add your team <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 400 }}>(optional)</span></h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>Invite staff now or later in Settings.</p>
            {staff.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 10, marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.role}</span>
                <button onClick={() => setStaff(ss => ss.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            ))}
            <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <input value={newStaff.name} onChange={e => setNewStaff(n => ({ ...n, name: e.target.value }))} placeholder="Name" style={{ ...iS, marginBottom: 8 }} />
              <input value={newStaff.email} onChange={e => setNewStaff(n => ({ ...n, email: e.target.value }))} placeholder="Email" style={{ ...iS, marginBottom: 8 }} />
              <select value={newStaff.role} onChange={e => setNewStaff(n => ({ ...n, role: e.target.value }))} style={{ ...iS, cursor: 'pointer', marginBottom: 8 }}>
                {['Owner', 'Manager', 'Cashier'].map(r => <option key={r}>{r}</option>)}
              </select>
              <button onClick={() => { if (newStaff.name) { setStaff(ss => [...ss, { ...newStaff }]); setNewStaff({ name: '', email: '', role: 'Cashier' }); } }} style={{ width: '100%', padding: '10px', borderRadius: 9, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add staff member</button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={() => setStep(2)} style={{ padding: '12px 24px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
              <button onClick={() => { track('onboarding_step', { step: 3, completed: false }); setStep(4); }} style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Skip for now</button>
              <button onClick={() => { setStep(4); track('onboarding_step', { step: 3, completed: true }); }} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Add team & continue →</button>
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Bring your products in</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>Choose how to get started with inventory.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {[
                { label: 'Import from existing POS', desc: 'Shopfront, Square, Lightspeed, or any CSV', href: '/pos/setup/migrate', icon: '📤' },
                { label: 'Upload CSV', desc: 'Use our template to bulk-import products', href: '/pos/products/import', icon: '📋' },
                { label: 'Start blank', desc: 'Add products as you sell them at the terminal', href: null, icon: '🏪' },
              ].map(opt => (
                <div key={opt.label} onClick={() => { if (opt.href) { router.push(opt.href); track('onboarding_step', { step: 4, completed: true }); } else { setStep(5); track('onboarding_step', { step: 4, completed: true }); } }}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', background: 'var(--bg-surface)', borderRadius: 14, cursor: 'pointer', border: '1px solid var(--border-subtle)', transition: 'border-color 150ms' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--violet)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}>
                  <span style={{ fontSize: 28 }}>{opt.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.desc}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 18, color: 'var(--text-tertiary)' }}>→</div>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(3)} style={{ padding: '12px 24px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
          </div>
        )}

        {/* STEP 5 */}
        {step === 5 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 60, marginBottom: 20 }}>🚀</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>You&apos;re set. Aria is ready.</h1>
            <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(167,139,250,0.10) 100%)', border: '1px solid rgba(167,139,250,0.28)', borderRadius: 16, padding: '22px 24px', marginBottom: 32, textAlign: 'left' }}>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, fontStyle: 'italic' }}>
                &ldquo;I&apos;m Aria. I&apos;ll quietly learn your business for the first week. After that, I&apos;ll start drafting reorders, flagging slow stock, and answering your questions in plain English. You stay in control — every decision I make needs your one-tap approval until you trust me otherwise.&rdquo;
              </p>
              <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: 'var(--violet)' }}>— Aria, your AI business partner</div>
            </div>
            <button onClick={saveSetup} disabled={saving} style={{ padding: '14px 40px', borderRadius: 12, border: 'none', background: saving ? 'var(--bg-elevated)' : 'var(--violet)', color: saving ? 'var(--text-secondary)' : '#fff', fontSize: 16, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Setting up…' : 'Open Aria →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
