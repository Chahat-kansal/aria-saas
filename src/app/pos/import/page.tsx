'use client';
import { useState, useEffect, useRef } from 'react';
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

const iCls = { background: 'rgba(10,9,16,0.8)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: "'Manrope',sans-serif", width: '100%', boxSizing: 'border-box' as const };
const lCls = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

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

      // Refresh status
      const newStatus = await fetch(`/api/integrations/status?business_id=${bid}`).then(r => r.json());
      setStatus(newStatus);

      // Run duplicate detection after import
      const dupRes = await fetch('/api/pos/import/deduplicate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) });
      const dupData = await dupRes.json();
      if (dupData.count > 0) { setDuplicates(dupData.duplicates); setShowDuplicates(true); }
    } catch (e: any) {
      setImportError(e.message || 'Import failed');
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

  const fmtTime = (s: string | null | undefined) => s ? new Date(s).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never';

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Import Products</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Migrate your existing products into AriaPOS from your current POS or by scanning barcodes</p>
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

        {/* Option cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px 22px' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔗</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Connect & Import</h2>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Pull products directly from Square, Shopify, or Lightspeed. One click. No CSV needed.
            </p>
            <p style={{ fontSize: 11, color: C.dim }}>↓ See integrations below</p>
          </div>
          <Link href="/pos/import/scan" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px 22px', textDecoration: 'none', display: 'block', transition: 'border-color 150ms' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📷</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Scan to Import</h2>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Walk your store and scan barcodes. Aria auto-fills product details from the global database.
            </p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700 }}>
              Start scanning →
            </span>
          </Link>
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
            {results['square'] && (
              <ImportResultBanner result={results['square']} platform="Square" />
            )}
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

        <div style={{ marginTop: 24, padding: '14px 0', borderTop: `1px solid ${C.border}` }}>
          <Link href="/pos/products" style={{ fontSize: 13, color: C.violet, textDecoration: 'none', fontWeight: 600 }}>
            View all products →
          </Link>
        </div>
      </div>
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
