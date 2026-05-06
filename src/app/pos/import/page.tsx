'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444', amber:'#F59E0B' };

interface IntegrationStatus {
  connected: boolean;
  sync_status?: string;
  last_synced_at?: string | null;
  product_count?: number;
  shop_name?: string;
  store_url?: string;
  account_id?: string;
}

interface ImportResult { imported: number; updated: number; skipped: number; total: number; }
interface Duplicate {
  name: string;
  products: Array<{ id: string; name: string; source: string; price: number; sku: string | null; barcode: string | null }>;
}

type CsvPhase = 'idle' | 'mapping' | 'preview' | 'importing' | 'done';

interface CsvPreviewRow {
  name: string; price: string; sku: string; barcode: string;
  category: string; cost_price: string; stock_qty: string; description: string;
  _raw: Record<string, string>;
}

const iCls = { background: 'rgba(10,9,16,0.8)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: "'Manrope',sans-serif", width: '100%', boxSizing: 'border-box' as const };
const lCls = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', price: 'Price', sku: 'SKU', barcode: 'Barcode',
  category: 'Category', cost_price: 'Cost Price', stock_qty: 'Stock Qty', description: 'Description',
};

export default function ImportPage() {
  const [bid, setBid]                     = useState<string | null>(null);
  const [status, setStatus]               = useState<{ square: IntegrationStatus; shopify: IntegrationStatus; lightspeed: IntegrationStatus } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Shopify form
  const [shopifyUrl, setShopifyUrl]       = useState('');
  const [shopifyToken, setShopifyToken]   = useState('');
  const [shopifyExpanded, setShopifyExpanded] = useState(false);

  // Lightspeed form
  const [lsAccount, setLsAccount]         = useState('');
  const [lsToken, setLsToken]             = useState('');
  const [lsExpanded, setLsExpanded]       = useState(false);

  // Import state per platform
  const [importing, setImporting]         = useState<string | null>(null);
  const [results, setResults]             = useState<Record<string, ImportResult>>({});
  const [importError, setImportError]     = useState<string | null>(null);

  // Duplicates
  const [duplicates, setDuplicates]       = useState<Duplicate[]>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);

  // CSV AI import
  const [csvPhase, setCsvPhase]           = useState<CsvPhase>('idle');
  const [csvText, setCsvText]             = useState('');
  const [csvFileName, setCsvFileName]     = useState('');
  const [csvHeaders, setCsvHeaders]       = useState<string[]>([]);
  const [csvMapping, setCsvMapping]       = useState<Record<string, string | null>>({});
  const [csvPreview, setCsvPreview]       = useState<CsvPreviewRow[]>([]);
  const [csvTotalRows, setCsvTotalRows]   = useState(0);
  const [csvError, setCsvError]           = useState<string | null>(null);
  const [csvResult, setCsvResult]         = useState<{ imported: number; updated: number; skipped: number; total: number } | null>(null);
  const [csvUnmapped, setCsvUnmapped]     = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // URL param feedback
  const urlError   = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error') : null;
  const urlSuccess = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('connected') : null;

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      if (d.business_id) {
        setBid(d.business_id);
        fetch(`/api/integrations/status?business_id=${d.business_id}`)
          .then(r => r.json())
          .then(s => { setStatus(s); setLoadingStatus(false); })
          .catch(() => setLoadingStatus(false));
      } else setLoadingStatus(false);
    }).catch(() => setLoadingStatus(false));
  }, []);

  async function runImport(platform: string) {
    if (!bid) return;
    setImporting(platform); setImportError(null);
    try {
      let body: Record<string, string> = { business_id: bid };
      if (platform === 'shopify') {
        if (!shopifyUrl || !shopifyToken) { setImportError('Enter Shopify store URL and Admin API token'); setImporting(null); return; }
        body = { ...body, shopify_store_url: shopifyUrl, shopify_admin_token: shopifyToken };
      }
      if (platform === 'lightspeed') {
        if (!lsAccount || !lsToken) { setImportError('Enter Lightspeed Account ID and API token'); setImporting(null); return; }
        body = { ...body, lightspeed_account_id: lsAccount, lightspeed_token: lsToken };
      }

      const res = await fetch(`/api/integrations/${platform}/import-products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.ok) { setImportError(d.error || 'Import failed'); setImporting(null); return; }
      setResults(r => ({ ...r, [platform]: d }));

      const newStatus = await fetch(`/api/integrations/status?business_id=${bid}`).then(r => r.json());
      setStatus(newStatus);

      const dupRes = await fetch('/api/pos/import/deduplicate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) });
      const dupData = await dupRes.json();
      if (dupData.count > 0) { setDuplicates(dupData.duplicates); setShowDuplicates(true); }
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    }
    setImporting(null);
  }

  async function mergeDuplicate(keepId: string, deleteId: string) {
    if (!bid) return;
    await fetch('/api/pos/import/deduplicate', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: bid, keep_id: keepId, delete_id: deleteId }),
    });
    setDuplicates(prev => prev.filter(d => !d.products.some(p => p.id === deleteId)));
  }

  // ── CSV import handlers ────────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => { setCsvText(String(ev.target?.result ?? '')); setCsvPhase('idle'); setCsvResult(null); setCsvError(null); };
    reader.readAsText(file);
  }

  const runCsvMapping = useCallback(async () => {
    if (!csvText.trim()) return;
    setCsvPhase('mapping'); setCsvError(null);
    try {
      const res = await fetch('/api/pos/import/csv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_text: csvText }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { setCsvError(d.error || 'Mapping failed'); setCsvPhase('idle'); return; }
      setCsvMapping(d.mapping);
      setCsvPreview(d.preview);
      setCsvTotalRows(d.total_rows);
      setCsvHeaders(d.headers);
      setCsvUnmapped(d.unmapped_columns ?? []);
      setCsvPhase('preview');
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : 'Failed');
      setCsvPhase('idle');
    }
  }, [csvText]);

  async function confirmCsvImport() {
    if (!csvText.trim()) return;
    setCsvPhase('importing');
    try {
      const res = await fetch('/api/pos/import/csv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_text: csvText, confirmed: true, mapping: csvMapping }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { setCsvError(d.error || 'Import failed'); setCsvPhase('preview'); return; }
      setCsvResult(d);
      setCsvPhase('done');
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : 'Import failed');
      setCsvPhase('preview');
    }
  }

  function resetCsv() {
    setCsvPhase('idle'); setCsvText(''); setCsvFileName(''); setCsvMapping({});
    setCsvPreview([]); setCsvTotalRows(0); setCsvResult(null); setCsvError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const fmtTime = (s: string | null | undefined) => s ? new Date(s).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never';

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '24px 28px', maxWidth: 960 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Import Products</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Migrate your existing products into AriaPOS from your current POS, a spreadsheet, or by scanning barcodes</p>
        </div>

        {/* URL feedback */}
        {urlError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: C.red }}>
            ⚠️ {urlError.replace(/\+/g, ' ')}
          </div>
        )}
        {urlSuccess && (
          <div style={{ background: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.25)`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: C.green }}>
            ✓ {urlSuccess.charAt(0).toUpperCase() + urlSuccess.slice(1)} connected successfully
          </div>
        )}

        {/* Option cards — 3-col */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 36 }}>
          {/* Connect & Import */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px 20px' }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>🔗</div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Connect & Import</h2>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
              Pull products directly from Square, Shopify, or Lightspeed.
            </p>
            <p style={{ fontSize: 11, color: C.dim }}>↓ See integrations below</p>
          </div>

          {/* Spreadsheet / CSV */}
          <button
            onClick={() => { const el = document.getElementById('csv-section'); el?.scrollIntoView({ behavior: 'smooth' }); }}
            style={{ background: C.card, border: `1px solid rgba(139,92,246,0.3)`, borderRadius: 18, padding: '24px 20px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 150ms' }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>📊</div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Spreadsheet Import</h2>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
              Upload a CSV. Aria AI maps your columns automatically — no manual setup.
            </p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700 }}>
              ✨ AI-powered →
            </span>
          </button>

          {/* Scan to Import */}
          <Link href="/pos/import/scan" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px 20px', textDecoration: 'none', display: 'block', transition: 'border-color 150ms' }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>📷</div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Scan to Import</h2>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
              Walk your store and scan barcodes. Aria auto-fills details from the global database.
            </p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: 'rgba(34,197,94,0.15)', color: C.green, fontSize: 12, fontWeight: 700, border: `1px solid rgba(34,197,94,0.25)` }}>
              Start scanning →
            </span>
          </Link>
        </div>

        {/* ── CSV / Spreadsheet AI Import ─────────────────────────────── */}
        <div id="csv-section" style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Spreadsheet Import</h2>
            <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(139,92,246,0.15)', color: C.violet, fontWeight: 700 }}>✨ AI column mapping</span>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>

            {/* Upload zone */}
            <div style={{ padding: '20px 22px', borderBottom: csvPhase !== 'idle' ? `1px solid ${C.border}` : 'none' }}>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileSelect} style={{ display: 'none' }} id="csv-file-input" />
              <div
                onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${csvFileName ? C.violet : C.dim}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 200ms', background: csvFileName ? 'rgba(139,92,246,0.05)' : 'transparent' }}>
                <p style={{ fontSize: 28, marginBottom: 8 }}>{csvFileName ? '📄' : '📊'}</p>
                {csvFileName ? (
                  <>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{csvFileName}</p>
                    <p style={{ fontSize: 12, color: C.muted }}>Click to choose a different file</p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.muted, marginBottom: 4 }}>Drop your CSV here or click to browse</p>
                    <p style={{ fontSize: 12, color: C.dim }}>Supports CSV files from Excel, Google Sheets, Vend, Kounta, or any POS export</p>
                  </>
                )}
              </div>

              {csvFileName && csvPhase === 'idle' && (
                <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                  <button onClick={runCsvMapping}
                    style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✨ Map with AI
                  </button>
                  <button onClick={resetCsv}
                    style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Clear
                  </button>
                </div>
              )}
              {csvPhase === 'mapping' && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 18, height: 18, border: `2px solid ${C.violet}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 13, color: C.muted }}>Aria is mapping your columns…</span>
                </div>
              )}
            </div>

            {/* Preview / mapping table */}
            {(csvPhase === 'preview' || csvPhase === 'importing' || csvPhase === 'done') && (
              <div style={{ padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                      {csvPhase === 'done' ? '✓ Import complete' : `Preview — ${csvTotalRows} rows detected`}
                    </p>
                    {csvUnmapped.length > 0 && csvPhase !== 'done' && (
                      <p style={{ fontSize: 12, color: C.amber }}>⚠ {csvUnmapped.length} column{csvUnmapped.length !== 1 ? 's' : ''} could not be mapped: {csvUnmapped.slice(0, 3).join(', ')}{csvUnmapped.length > 3 ? '…' : ''}</p>
                    )}
                  </div>
                  {csvPhase !== 'done' && (
                    <button onClick={resetCsv} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Start over</button>
                  )}
                </div>

                {/* Column mapping editor */}
                {csvPhase !== 'done' && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ ...lCls, marginBottom: 10 }}>Column mapping — adjust if needed</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                      {csvHeaders.map(col => (
                        <div key={col} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: C.dim, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={col}>{col}</span>
                          <span style={{ fontSize: 11, color: C.dim }}>→</span>
                          <select
                            value={csvMapping[col] ?? ''}
                            onChange={e => setCsvMapping(m => ({ ...m, [col]: e.target.value || null }))}
                            style={{ background: 'rgba(10,9,16,0.8)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, color: csvMapping[col] ? C.violet : C.dim, outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                            <option value="">— ignore —</option>
                            {Object.entries(FIELD_LABELS).map(([v, l]) => <option key={v} value={v} style={{ background: '#111' }}>{l}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview rows */}
                {csvPhase !== 'done' && csvPreview.length > 0 && (
                  <div style={{ marginBottom: 20, overflowX: 'auto' }}>
                    <p style={{ ...lCls, marginBottom: 8 }}>Sample preview (first {csvPreview.length} rows)</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {(['name','price','sku','barcode','category','cost_price','stock_qty'] as const).map(f => (
                            <th key={f} style={{ padding: '6px 10px', textAlign: 'left', color: C.dim, fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{FIELD_LABELS[f]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((row, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid rgba(42,37,64,0.5)` }}>
                            <td style={{ padding: '7px 10px', color: row.name ? C.text : C.dim }}>{row.name || <span style={{ color: C.red, fontSize: 11 }}>Missing!</span>}</td>
                            <td style={{ padding: '7px 10px', color: C.text }}>{row.price}</td>
                            <td style={{ padding: '7px 10px', color: C.muted }}>{row.sku}</td>
                            <td style={{ padding: '7px 10px', color: C.muted }}>{row.barcode}</td>
                            <td style={{ padding: '7px 10px', color: C.muted }}>{row.category}</td>
                            <td style={{ padding: '7px 10px', color: C.muted }}>{row.cost_price}</td>
                            <td style={{ padding: '7px 10px', color: C.muted }}>{row.stock_qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvTotalRows > csvPreview.length && (
                      <p style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>…and {csvTotalRows - csvPreview.length} more rows</p>
                    )}
                  </div>
                )}

                {/* Result banner */}
                {csvPhase === 'done' && csvResult && (
                  <div style={{ padding: '16px 18px', background: 'rgba(34,197,94,0.07)', border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 12, marginBottom: 16 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.green, marginBottom: 8 }}>✓ Spreadsheet imported successfully</p>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: C.green }}>↑ {csvResult.imported} new products</span>
                      <span style={{ fontSize: 13, color: C.muted }}>↻ {csvResult.updated} updated</span>
                      {csvResult.skipped > 0 && <span style={{ fontSize: 13, color: C.dim }}>✗ {csvResult.skipped} skipped</span>}
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                      <Link href="/pos/products" style={{ padding: '8px 16px', borderRadius: 9, background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                        View products →
                      </Link>
                      <button onClick={resetCsv} style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Import another file
                      </button>
                    </div>
                  </div>
                )}

                {csvError && (
                  <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 10, fontSize: 13, color: C.red, marginBottom: 14 }}>
                    ⚠️ {csvError}
                  </div>
                )}

                {csvPhase === 'preview' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={confirmCsvImport}
                      style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Import {csvTotalRows} products →
                    </button>
                    <button onClick={() => setCsvPhase('idle')}
                      style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Re-map columns
                    </button>
                  </div>
                )}
                {csvPhase === 'importing' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 18, height: 18, border: `2px solid ${C.violet}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: 13, color: C.muted }}>Importing {csvTotalRows} products…</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── API Integrations ── */}
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>Import from another POS system</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Square */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(0,180,160,0.15)', border: '1px solid rgba(0,180,160,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>⬛</div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Square</p>
                  {loadingStatus ? (
                    <p style={{ fontSize: 12, color: C.dim }}>Checking connection…</p>
                  ) : status?.square.connected ? (
                    <p style={{ fontSize: 12, color: C.green }}>✓ Connected · {status.square.product_count} products imported · Last sync: {fmtTime(status.square.last_synced_at)}</p>
                  ) : (
                    <p style={{ fontSize: 12, color: C.dim }}>Not connected</p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {status?.square.connected ? (
                  <button onClick={() => runImport('square')} disabled={importing === 'square' || !bid}
                    style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: importing === 'square' ? 0.6 : 1 }}>
                    {importing === 'square' ? 'Importing…' : '↻ Import Products'}
                  </button>
                ) : (
                  <a href="/api/integrations/square/connect"
                    style={{ padding: '9px 20px', borderRadius: 9, border: `1px solid rgba(0,180,160,0.4)`, background: 'rgba(0,180,160,0.08)', color: '#00B4A0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                    Connect Square
                  </a>
                )}
              </div>
            </div>
            {results['square'] && <ImportResultBanner result={results['square']} platform="Square" />}
          </div>

          {/* Shopify */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(120,190,60,0.15)', border: '1px solid rgba(120,190,60,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🛍</div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Shopify</p>
                  {loadingStatus ? (
                    <p style={{ fontSize: 12, color: C.dim }}>Checking connection…</p>
                  ) : status?.shopify.connected ? (
                    <p style={{ fontSize: 12, color: C.green }}>✓ {status.shopify.shop_name || status.shopify.store_url} · {status.shopify.product_count} products · Last sync: {fmtTime(status.shopify.last_synced_at)}</p>
                  ) : (
                    <p style={{ fontSize: 12, color: C.dim }}>Not connected</p>
                  )}
                </div>
              </div>
              <button onClick={() => setShopifyExpanded(e => !e)}
                style={{ padding: '9px 20px', borderRadius: 9, border: `1px solid rgba(120,190,60,0.4)`, background: shopifyExpanded ? 'rgba(120,190,60,0.15)' : 'transparent', color: '#78BE3C', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {status?.shopify.connected ? '↻ Re-import' : 'Connect Shopify'}
              </button>
            </div>
            {shopifyExpanded && (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14, borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={lCls}>Store URL</label>
                    <input value={shopifyUrl} onChange={e => setShopifyUrl(e.target.value)} placeholder="yourstore.myshopify.com" style={iCls} />
                  </div>
                  <div>
                    <label style={lCls}>Admin API Token</label>
                    <input type="password" value={shopifyToken} onChange={e => setShopifyToken(e.target.value)} placeholder="shpat_…" style={iCls} />
                  </div>
                </div>
                <p style={{ fontSize: 11, color: C.dim }}>
                  Get your token: Shopify Admin → Settings → Apps and sales channels → Develop apps → Create app → Admin API access token
                </p>
                <button onClick={() => runImport('shopify')} disabled={importing === 'shopify' || !shopifyUrl || !shopifyToken}
                  style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: '#78BE3C', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start', opacity: importing === 'shopify' ? 0.6 : 1 }}>
                  {importing === 'shopify' ? 'Importing…' : 'Import from Shopify'}
                </button>
              </div>
            )}
            {results['shopify'] && <ImportResultBanner result={results['shopify']} platform="Shopify" />}
          </div>

          {/* Lightspeed */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>⚡</div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Lightspeed</p>
                  {loadingStatus ? (
                    <p style={{ fontSize: 12, color: C.dim }}>Checking connection…</p>
                  ) : status?.lightspeed.connected ? (
                    <p style={{ fontSize: 12, color: C.green }}>✓ Account {status.lightspeed.account_id} · {status.lightspeed.product_count} products · Last sync: {fmtTime(status.lightspeed.last_synced_at)}</p>
                  ) : (
                    <p style={{ fontSize: 12, color: C.dim }}>Not connected</p>
                  )}
                </div>
              </div>
              <button onClick={() => setLsExpanded(e => !e)}
                style={{ padding: '9px 20px', borderRadius: 9, border: `1px solid rgba(245,158,11,0.4)`, background: lsExpanded ? 'rgba(245,158,11,0.1)' : 'transparent', color: C.amber, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {status?.lightspeed.connected ? '↻ Re-import' : 'Connect Lightspeed'}
              </button>
            </div>
            {lsExpanded && (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14, borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={lCls}>Account ID</label>
                    <input value={lsAccount} onChange={e => setLsAccount(e.target.value)} placeholder="123456" style={iCls} />
                  </div>
                  <div>
                    <label style={lCls}>API Token</label>
                    <input type="password" value={lsToken} onChange={e => setLsToken(e.target.value)} placeholder="Bearer token" style={iCls} />
                  </div>
                </div>
                <p style={{ fontSize: 11, color: C.dim }}>
                  Find your Account ID in Lightspeed → Settings → Account. Generate an API token via the Lightspeed Developer Portal.
                </p>
                <button onClick={() => runImport('lightspeed')} disabled={importing === 'lightspeed' || !lsAccount || !lsToken}
                  style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.amber, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start', opacity: importing === 'lightspeed' ? 0.6 : 1 }}>
                  {importing === 'lightspeed' ? 'Importing…' : 'Import from Lightspeed'}
                </button>
              </div>
            )}
            {results['lightspeed'] && <ImportResultBanner result={results['lightspeed']} platform="Lightspeed" />}
          </div>

        </div>

        {importError && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 12, fontSize: 13, color: C.red }}>
            ⚠️ {importError}
          </div>
        )}

        {/* Duplicate detection results */}
        {showDuplicates && duplicates.length > 0 && (
          <div style={{ marginTop: 24, background: C.card, border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>⚠️ {duplicates.length} possible duplicate{duplicates.length !== 1 ? 's' : ''} found</p>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Review and merge to keep your catalogue clean</p>
              </div>
              <button onClick={() => setShowDuplicates(false)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>&times;</button>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {duplicates.map((dup, i) => (
                <div key={i} style={{ padding: '14px 18px', borderBottom: i < duplicates.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>{dup.name}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dup.products.map((p, j) => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(139,92,246,0.15)', color: C.violet, fontWeight: 700 }}>{p.source}</span>
                          <span style={{ fontSize: 12, color: C.muted }}>A${p.price.toFixed(2)}</span>
                          {p.sku && <span style={{ fontSize: 10, color: C.dim }}>SKU: {p.sku}</span>}
                        </div>
                        {j > 0 && (
                          <button onClick={() => mergeDuplicate(dup.products[0].id, p.id)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Delete (keep first)
                          </button>
                        )}
                        {j === 0 && <span style={{ fontSize: 11, color: C.dim }}>← keep</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 28, padding: '14px 0', borderTop: `1px solid ${C.border}` }}>
          <Link href="/pos/products" style={{ fontSize: 13, color: C.violet, textDecoration: 'none', fontWeight: 600 }}>
            View all products →
          </Link>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ImportResultBanner({ result, platform }: { result: ImportResult; platform: string }) {
  return (
    <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(34,197,94,0.07)', border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 700 }}>✓ {platform} import complete</span>
      <span style={{ fontSize: 12, color: '#22C55E' }}>↑ {result.imported} new</span>
      <span style={{ fontSize: 12, color: '#8B85A8' }}>↻ {result.updated} updated</span>
      {result.skipped > 0 && <span style={{ fontSize: 12, color: '#4A4565' }}>✗ {result.skipped} skipped</span>}
      <Link href="/pos/products" style={{ fontSize: 12, color: '#8B5CF6', textDecoration: 'none', marginLeft: 'auto' }}>View products →</Link>
    </div>
  );
}
