'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = ['Upload', 'Map Fields', 'Preview', 'Import', 'Report'];

const FIELD_MAP = [
  { csv: 'NAME', aria: 'name', label: 'Product Name' },
  { csv: 'BARCODE', aria: 'barcode', label: 'Barcode' },
  { csv: 'RETAIL', aria: 'price', label: 'Retail Price' },
  { csv: 'COST', aria: 'cost_price', label: 'Cost Price' },
  { csv: 'BRAND', aria: 'brand', label: 'Brand' },
  { csv: 'CATEGORY', aria: 'category', label: 'Category' },
  { csv: 'STOCK', aria: 'stock_quantity', label: 'Stock On Hand' },
];

const SAMPLE_ROWS = [
  { NAME: 'Carlton Dry 6pk', BARCODE: '9310072000024', RETAIL: '24.99', COST: '15.20', BRAND: 'CUB', CATEGORY: 'Beer', STOCK: '48' },
  { NAME: 'Coopers Pale Ale 6pk', BARCODE: '9310035000012', RETAIL: '22.99', COST: '14.40', BRAND: 'Coopers', CATEGORY: 'Beer', STOCK: '24' },
  { NAME: 'Penfolds Bin 2 750ml', BARCODE: '9310012400043', RETAIL: '34.99', COST: '22.00', BRAND: 'Penfolds', CATEGORY: 'Wine', STOCK: '12' },
  { NAME: 'Smirnoff Vodka 700ml', BARCODE: '9310088120010', RETAIL: '42.99', COST: '28.50', BRAND: 'Smirnoff', CATEGORY: 'Spirits', STOCK: '8' },
  { NAME: 'Corona 24pk', BARCODE: '9310099000056', RETAIL: '62.99', COST: '41.00', BRAND: 'Corona', CATEGORY: 'Beer', STOCK: '36' },
];

export default function ShopfrontMigratePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [productsFile, setProductsFile] = useState<File | null>(null);
  const [customersFile, setCustomersFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step === 4) {
      setProgress(0);
      const stages = [
        { at: 20, label: 'Importing products... (234/847)' },
        { at: 50, label: 'Importing products... (600/847)' },
        { at: 70, label: 'Importing customers... (45/91)' },
        { at: 85, label: 'Matching sales records...' },
        { at: 100, label: 'Finalising import...' },
      ];
      let pct = 0;
      intervalRef.current = setInterval(() => {
        pct = Math.min(pct + 2, 100);
        setProgress(pct);
        const stage = stages.filter(s => pct >= s.at).pop();
        if (stage) setProgressLabel(stage.label);
        if (pct >= 100) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimeout(() => setStep(5), 600);
        }
      }, 60);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [step]);

  const StepDot = ({ n }: { n: number }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: step >= n ? 'var(--violet)' : 'var(--bg-elevated)', color: step >= n ? '#fff' : 'var(--text-tertiary)', border: step === n ? '2px solid var(--violet)' : '1px solid var(--border-default)' }}>{n}</div>
      <span style={{ fontSize: 10, color: step === n ? 'var(--violet)' : 'var(--text-tertiary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{STEPS[n - 1]}</span>
    </div>
  );

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '32px 28px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Shopfront Migration</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 32 }}>Import your products, customers, and sales history.</p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 36, position: 'relative' }}>
          {STEPS.map((_, i) => <StepDot key={i} n={i + 1} />)}
        </div>

        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>Upload your Shopfront exports</h2>
            {[
              { label: 'Products CSV', key: 'products', required: true, file: productsFile, set: setProductsFile },
              { label: 'Customers CSV', key: 'customers', required: false, file: customersFile, set: setCustomersFile },
              { label: 'Sales CSV', key: 'sales', required: false, file: salesFile, set: setSalesFile },
            ].map(({ label, required, file, set }) => (
              <div key={label} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  {label} {required && <span style={{ color: 'var(--violet)' }}>*</span>}
                </label>
                <div style={{ border: '2px dashed var(--border-default)', borderRadius: 10, padding: '20px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(52,211,153,0.06)' : 'var(--bg-surface)' }} onClick={() => document.getElementById(`file-${label}`)?.click()}>
                  {file ? (
                    <span style={{ fontSize: 13, color: '#34D399', fontWeight: 600 }}>✓ {file.name}</span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Click to upload {label}</span>
                  )}
                  <input id={`file-${label}`} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => set(e.target.files?.[0] ?? null)} />
                </div>
              </div>
            ))}
            <button onClick={() => setStep(2)} disabled={!productsFile} style={{ marginTop: 12, padding: '10px 24px', borderRadius: 9, border: 'none', background: productsFile ? 'var(--violet)' : 'var(--bg-elevated)', color: productsFile ? '#fff' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: productsFile ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--text-primary)' }}>
              ✨ Aria detected your column structure automatically.
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>Confirm field mapping</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['Your CSV column', 'Aria field', 'Description'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELD_MAP.map((row, i) => (
                  <tr key={row.csv} style={{ borderTop: i > 0 ? '1px solid var(--divider)' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-secondary)' }}>{row.csv}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--violet)' }}>{row.aria}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-tertiary)' }}>{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setStep(3)} style={{ padding: '10px 24px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Looks good →
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Preview</h2>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 13, color: '#34D399', fontWeight: 600 }}>✓ 847 products ready</span>
              <span style={{ fontSize: 13, color: '#FBBF24', fontWeight: 600 }}>⚠ 3 rows missing barcodes (will be skipped)</span>
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-default)', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    {Object.keys(SAMPLE_ROWS[0]).map(k => (
                      <th key={k} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_ROWS.map((row, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--divider)' }}>
                      {Object.values(row).map((v, j) => (
                        <td key={j} style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setStep(4)} style={{ padding: '10px 24px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Start Import →
            </button>
          </div>
        )}

        {step === 4 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 24 }}>Importing your data…</h2>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 99, height: 10, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--violet)', borderRadius: 99, width: `${progress}%`, transition: 'width 0.2s ease' }} />
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{progressLabel || 'Preparing...'}</p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>{progress}% complete</p>
          </div>
        )}

        {step === 5 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Import complete</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Your data is now in Aria.</p>
            </div>
            {[
              { icon: '✓', label: '847 products imported', ok: true },
              { icon: '✓', label: '91 customers imported', ok: true },
              { icon: '✓', label: '2,341 sales imported', ok: true },
              { icon: '⚠', label: '3 records unmatched', ok: false },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
                <span style={{ fontSize: 16, color: r.ok ? '#34D399' : '#FBBF24' }}>{r.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</span>
                {!r.ok && <button onClick={() => alert('Download not available in demo')} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--violet)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Download CSV</button>}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => router.push('/pos/inventory')} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Go to Inventory →
              </button>
              <button onClick={() => { setStep(1); setProductsFile(null); setCustomersFile(null); setSalesFile(null); }} style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
