'use client';
import { useState, useRef, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import Link from 'next/link';

interface ExtractedLine {
  description: string;
  quantity: number;
  unit: string;
  unit_price_aud: number | null;
  total_price_aud: number | null;
  matched_item: { id: string; name: string; current_stock: number } | null;
  match_confidence: 'exact' | 'fuzzy' | 'none';
  suggested_new_stock: number;
}

interface ScanResult {
  extracted_lines: ExtractedLine[];
  supplier_name: string | null;
  invoice_date: string | null;
  invoice_total_aud: number | null;
  line_count: number;
  error?: string;
}

type State = 'upload' | 'scanning' | 'review' | 'confirmed';

const PROGRESS_STEPS = ['Reading image', 'Extracting items', 'Matching inventory'];

export default function ReceiptScanPage() {
  const { business } = useBusinessContext();
  const [state, setState] = useState<State>('upload');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [checkedRows, setCheckedRows] = useState<Record<number, boolean>>({});
  const [newStocks, setNewStocks] = useState<Record<number, number>>({});
  const [confirming, setConfirming] = useState(false);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!business?.id) return;
    setError('');
    setPreview(URL.createObjectURL(file));
    setState('scanning');
    setProgressStep(0);

    const tick = setInterval(() => setProgressStep(p => Math.min(p + 1, 2)), 2500);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('business_id', business.id);

      const res = await fetch('/api/aria/receipt-scan', { method: 'POST', body: form });
      clearInterval(tick);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? 'Scan failed. Please try again.');
        setState('upload');
        return;
      }

      const data: ScanResult = await res.json();

      if (data.line_count === 0) {
        setError(data.error ?? 'Aria couldn\'t read this invoice clearly. Try a photo with better lighting, or make sure the invoice text is clearly visible.');
        setState('upload');
        return;
      }

      setScanResult(data);
      const initChecked: Record<number, boolean> = {};
      const initStocks: Record<number, number> = {};
      data.extracted_lines.forEach((line, i) => {
        initChecked[i] = line.match_confidence !== 'none';
        initStocks[i] = line.suggested_new_stock;
      });
      setCheckedRows(initChecked);
      setNewStocks(initStocks);
      setState('review');
    } catch (err: any) {
      clearInterval(tick);
      setError(err.message ?? 'Scan failed');
      setState('upload');
    }
  }, [business?.id]);

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    if (!allowed.includes(file.type)) { setError('Please upload a photo (JPEG, PNG, WebP) or PDF.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File too large (max 10MB).'); return; }
    processFile(file);
  }

  async function handleConfirm() {
    if (!business?.id || !scanResult) return;
    setConfirming(true);

    const updates = scanResult.extracted_lines
      .filter((line, i) => checkedRows[i] && line.matched_item)
      .map((line, i) => ({
        item_id: line.matched_item!.id,
        new_stock: newStocks[i] ?? line.suggested_new_stock,
        quantity_added: line.quantity,
      }));

    if (updates.length === 0) { setState('confirmed'); setUpdatedCount(0); setConfirming(false); return; }

    const res = await fetch('/api/aria/receipt-scan/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, updates }),
    });
    const data = await res.json();
    setUpdatedCount(data.updated ?? 0);
    setState('confirmed');
    setConfirming(false);
  }

  function reset() {
    setState('upload');
    setScanResult(null);
    setPreview(null);
    setCheckedRows({});
    setNewStocks({});
    setError('');
    setProgressStep(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  const checkedCount = Object.values(checkedRows).filter(Boolean).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Receipt Scan</h1>
        <p style={{ color: '#6b7280' }}>Photograph a supplier invoice to update stock instantly</p>
      </div>

      {/* UPLOAD STATE */}
      {(state === 'upload') && (
        <div>
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-900/20 text-red-400 border border-red-900/30">{error}</div>
          )}
          <div
            className="border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all"
            style={{ borderColor: dragOver ? '#1D9E75' : 'rgba(255,255,255,0.1)', background: dragOver ? 'rgba(29,158,117,0.05)' : '#13131a' }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          >
            <div className="text-5xl mb-4">📸</div>
            <p className="text-white font-semibold text-lg mb-2">Take a photo or upload your supplier invoice</p>
            <p className="text-sm mb-6" style={{ color: '#6b7280' }}>JPEG, PNG, WebP, HEIC, or PDF · Max 10MB</p>
            <button className="px-6 py-2.5 rounded-full text-sm font-medium text-white" style={{ background: '#1D9E75' }}>
              Choose file
            </button>
          </div>
          <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden"
            onChange={e => handleFiles(e.target.files)} />
        </div>
      )}

      {/* SCANNING STATE */}
      {state === 'scanning' && (
        <div className="rounded-2xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          {preview && (
            <img src={preview} alt="Invoice preview" className="w-32 h-32 object-cover rounded-xl mx-auto mb-6 opacity-60" />
          )}
          <div className="flex justify-center mb-6">
            <div className="w-8 h-8 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
          <p className="text-white font-semibold mb-4">Aria is reading your invoice…</p>
          <div className="flex items-center justify-center gap-3">
            {PROGRESS_STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-colors ${i <= progressStep ? 'bg-[#1D9E75]' : 'bg-[rgba(255,255,255,0.1)]'}`} />
                <span className="text-xs" style={{ color: i <= progressStep ? '#1D9E75' : 'rgba(255,255,255,0.3)' }}>{step}</span>
                {i < PROGRESS_STEPS.length - 1 && <div className="w-6 h-px bg-[rgba(255,255,255,0.1)]" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REVIEW STATE */}
      {state === 'review' && scanResult && (
        <div>
          {/* Header */}
          <div className="rounded-xl p-4 mb-4 flex items-start justify-between" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              <p className="text-white font-semibold">Found {scanResult.line_count} item{scanResult.line_count !== 1 ? 's' : ''} on invoice</p>
              <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: '#9ca3af' }}>
                {scanResult.supplier_name && <span>📦 {scanResult.supplier_name}</span>}
                {scanResult.invoice_date && <span>📅 {scanResult.invoice_date}</span>}
                {scanResult.invoice_total_aud && <span className="text-white font-medium">Total: A${scanResult.invoice_total_aud.toFixed(2)}</span>}
              </div>
            </div>
            {preview && <img src={preview} alt="" className="w-12 h-12 object-cover rounded-lg opacity-60" />}
          </div>

          {/* Table */}
          <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['', 'Product (invoice)', 'Qty', 'Match', 'Current', 'New Stock'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ background: '#0d0d14' }}>
                {scanResult.extracted_lines.map((line, i) => (
                  <tr key={i} className={`${!checkedRows[i] ? 'opacity-50' : ''}`}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={!!checkedRows[i]}
                        onChange={e => setCheckedRows(p => ({ ...p, [i]: e.target.checked }))}
                        className="rounded" disabled={line.match_confidence === 'none'} />
                    </td>
                    <td className="px-3 py-3 text-white max-w-[200px] truncate">{line.description}</td>
                    <td className="px-3 py-3 text-white">{line.quantity} {line.unit}</td>
                    <td className="px-3 py-3">
                      {line.match_confidence === 'exact' && (
                        <span className="text-xs text-emerald-400">✓ {line.matched_item?.name}</span>
                      )}
                      {line.match_confidence === 'fuzzy' && (
                        <span className="text-xs text-amber-400">~ {line.matched_item?.name}</span>
                      )}
                      {line.match_confidence === 'none' && (
                        <span className="text-xs text-red-400">✗ No match</span>
                      )}
                    </td>
                    <td className="px-3 py-3" style={{ color: '#9ca3af' }}>
                      {line.matched_item ? line.matched_item.current_stock : '—'}
                    </td>
                    <td className="px-3 py-3">
                      {line.matched_item ? (
                        <input type="number" min={0}
                          value={newStocks[i] ?? line.suggested_new_stock}
                          onChange={e => setNewStocks(p => ({ ...p, [i]: parseInt(e.target.value) || 0 }))}
                          className="w-16 px-2 py-1 rounded-lg text-xs text-white outline-none"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                      ) : <span style={{ color: '#6b7280' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button onClick={handleConfirm} disabled={confirming || checkedCount === 0}
              className="flex-1 py-3 rounded-full text-sm font-semibold text-white disabled:opacity-40 transition-colors"
              style={{ background: '#1D9E75' }}>
              {confirming ? 'Updating…' : `Update ${checkedCount} item${checkedCount !== 1 ? 's' : ''}`}
            </button>
            <button onClick={reset}
              className="px-6 py-3 rounded-full text-sm font-medium transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMED STATE */}
      {state === 'confirmed' && (
        <div className="rounded-2xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Stock updated</h2>
          <p className="text-sm mb-8" style={{ color: '#9ca3af' }}>
            {updatedCount} item{updatedCount !== 1 ? 's' : ''} updated from your invoice
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={reset}
              className="px-6 py-2.5 rounded-full text-sm font-medium text-white"
              style={{ background: '#1D9E75' }}>
              Scan another invoice
            </button>
            <Link href="/pos/products"
              className="px-6 py-2.5 rounded-full text-sm font-medium text-center"
              style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
              View inventory
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
