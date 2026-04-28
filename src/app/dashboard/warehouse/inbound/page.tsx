'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import Link from 'next/link';

type FlowState = 'list' | 'step1' | 'step2' | 'step3' | 'complete';
interface GRN { id: string; grn_number: string; supplier_name: string | null; received_at: string; status: string; items: any[]; }
interface PO { id: string; po_number?: string; supplier_name?: string; status: string; }
interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; stock_quantity: number | null; cost_price: number | null; sku: string | null; }
interface Location { id: string; label: string | null; zone: string; bay: string; shelf: string; }

interface LineItem {
  item_id: string; item_name: string; lot_number: string; quantity_received: number;
  unit_cost_cents: number | null; expiry_date: string; location_id: string;
  condition: 'Good' | 'Damaged' | 'Short'; notes: string;
  po_expected_qty?: number;
}

const BLANK_LINE: LineItem = { item_id: '', item_name: '', lot_number: '', quantity_received: 1, unit_cost_cents: null, expiry_date: '', location_id: '', condition: 'Good', notes: '' };

export default function InboundPage() {
  const { business } = useBusinessContext();
  const [flowState, setFlowState] = useState<FlowState>('list');
  const [grns, setGrns] = useState<GRN[]>([]);
  const [openPOs, setOpenPOs] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ grn_number: string; item_count: number; has_discrepancy: boolean } | null>(null);

  // Form state
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([{ ...BLANK_LINE }]);
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [productResults, setProductResults] = useState<Record<number, Product[]>>({});

  const loadData = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [grnsRes, posRes, suppRes, locRes] = await Promise.all([
      fetch(`/api/warehouse/grn?business_id=${business.id}`).then(r => r.json()),
      fetch(`/api/pos/orders?business_id=${business.id}`).then(r => r.json()).catch(() => ({ orders: [] })),
      fetch(`/api/pos/suppliers`).then(r => r.json()).catch(() => ({ suppliers: [] })),
      fetch(`/api/warehouse/locations?business_id=${business.id}`).then(r => r.json()).catch(() => ({ locations: [] })),
    ]);
    setGrns(grnsRes.grns ?? []);
    setOpenPOs((posRes.orders ?? []).filter((p: PO) => ['draft', 'sent'].includes(p.status)));
    setSuppliers(suppRes.suppliers ?? []);
    setLocations(locRes.locations ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function searchProduct(idx: number, query: string) {
    setProductSearch(p => ({ ...p, [idx]: query }));
    if (query.length < 2) { setProductResults(p => ({ ...p, [idx]: [] })); return; }
    const res = await fetch(`/api/pos/products?search=${encodeURIComponent(query)}`).then(r => r.json()).catch(() => ({ products: [] }));
    setProductResults(p => ({ ...p, [idx]: (res.products ?? []).slice(0, 8) }));
  }

  function selectProduct(idx: number, prod: Product) {
    setLines(ls => ls.map((l, i) => i === idx ? {
      ...l, item_id: prod.id, item_name: prod.name,
      unit_cost_cents: prod.cost_price ? Math.round(prod.cost_price * 100) : null,
    } : l));
    setProductSearch(p => ({ ...p, [idx]: prod.name }));
    setProductResults(p => ({ ...p, [idx]: [] }));
  }

  async function handleConfirm() {
    if (!business?.id) return;
    setSubmitting(true);
    const res = await fetch('/api/warehouse/grn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id,
        purchase_order_id: selectedPO?.id ?? null,
        supplier_id: supplierId || null, supplier_name: supplierName,
        received_by: receivedBy, invoice_number: invoiceNumber, notes,
        items: lines.filter(l => l.item_id && l.quantity_received > 0),
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (res.ok) {
      setResult({ grn_number: data.grn_number, item_count: lines.filter(l => l.item_id).length, has_discrepancy: data.has_discrepancy });
      setFlowState('complete');
      loadData();
    }
  }

  function resetFlow() {
    setFlowState('list');
    setSelectedPO(null); setSupplierName(''); setSupplierId(''); setInvoiceNumber('');
    setReceivedBy(''); setNotes(''); setLines([{ ...BLANK_LINE }]);
    setProductSearch({}); setProductResults({}); setResult(null);
  }

  const totalUnits = lines.reduce((s, l) => s + (l.quantity_received || 0), 0);
  const totalValueCents = lines.reduce((s, l) => s + ((l.unit_cost_cents ?? 0) * (l.quantity_received || 0)), 0);
  const discrepancies = lines.filter(l => l.condition !== 'Good').length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Inbound Receiving</h1>
          <p style={{ color: '#6b7280' }}>Record goods received and update stock automatically</p>
        </div>
        {flowState === 'list' && (
          <button onClick={() => setFlowState('step1')} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>
            + New Receiving
          </button>
        )}
        {flowState !== 'list' && flowState !== 'complete' && (
          <button onClick={resetFlow} className="text-xs px-3 py-2 rounded-xl" style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
            Cancel
          </button>
        )}
      </div>

      {/* LIST VIEW */}
      {flowState === 'list' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['GRN #', 'Supplier', 'Date', 'Items', 'Status'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody style={{ background: '#0d0d14' }}>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>Loading…</td></tr>
              ) : grns.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No goods received yet. Click &quot;New Receiving&quot; to start.</td></tr>
              ) : grns.map(g => (
                <tr key={g.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-4 py-3 text-white font-medium">{g.grn_number}</td>
                  <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{g.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{new Date(g.received_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{Array.isArray(g.items) ? g.items.length : 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${g.status === 'confirmed' ? 'bg-green-900/30 text-green-400' : g.status === 'discrepancy' ? 'bg-red-900/30 text-red-400' : 'bg-[rgba(255,255,255,0.06)] text-gray-400'}`}>
                      {g.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* STEP 1 — Link PO */}
      {flowState === 'step1' && (
        <div className="rounded-xl p-6" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider mb-1">Step 1 of 3</p>
          <h2 className="text-lg font-semibold text-white mb-4">Link Purchase Order (optional)</h2>
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-2">Receiving against a Purchase Order?</label>
            <select value={selectedPO?.id ?? ''} onChange={e => {
              const po = openPOs.find(p => p.id === e.target.value) ?? null;
              setSelectedPO(po);
              if (po?.supplier_name) setSupplierName(po.supplier_name);
            }} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}>
              <option value="">No PO — ad hoc receiving</option>
              {openPOs.map(po => <option key={po.id} value={po.id}>{po.po_number ?? po.id.slice(0, 8)} — {po.supplier_name ?? 'Unknown'}</option>)}
            </select>
          </div>
          {selectedPO && (
            <div className="mb-4 p-3 rounded-xl text-xs" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)', color: '#9ca3af' }}>
              Linked to PO: {selectedPO.supplier_name ?? 'Unknown supplier'}
            </div>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setFlowState('step2')} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>Next →</button>
          </div>
        </div>
      )}

      {/* STEP 2 — Supplier & Invoice */}
      {flowState === 'step2' && (
        <div className="rounded-xl p-6" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider mb-1">Step 2 of 3</p>
          <h2 className="text-lg font-semibold text-white mb-4">Supplier & Invoice</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Supplier</label>
              <select value={supplierId} onChange={e => {
                setSupplierId(e.target.value);
                const s = suppliers.find(s => s.id === e.target.value);
                if (s) setSupplierName(s.name);
              }} className="w-full px-3 py-2 rounded-xl text-sm outline-none mb-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}>
                <option value="">Select supplier or type below</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Or type supplier name" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Invoice number</label>
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="INV-12345" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Received by</label>
              <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)} placeholder="Your name" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for this delivery" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
            </div>
          </div>
          <div className="flex justify-between mt-6">
            <button onClick={() => setFlowState('step1')} className="px-4 py-2.5 rounded-xl text-sm" style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>← Back</button>
            <button onClick={() => setFlowState('step3')} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>Next →</button>
          </div>
        </div>
      )}

      {/* STEP 3 — Line items */}
      {flowState === 'step3' && (
        <div>
          <div className="rounded-xl p-5 mb-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider mb-1">Step 3 of 3</p>
            <h2 className="text-lg font-semibold text-white">Items Received</h2>
          </div>

          <div className="space-y-3 mb-4">
            {lines.map((line, idx) => (
              <div key={idx} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white">Item {idx + 1}</span>
                  {lines.length > 1 && <button onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))} className="text-xs text-red-400 hover:text-red-300">Remove</button>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Product *</label>
                    <input value={productSearch[idx] ?? line.item_name} onChange={e => searchProduct(idx, e.target.value)} placeholder="Search product name…" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                    {(productResults[idx] ?? []).length > 0 && (
                      <div className="mt-1 rounded-xl overflow-hidden" style={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {(productResults[idx] ?? []).map(p => (
                          <button key={p.id} onClick={() => selectProduct(idx, p)} className="w-full text-left px-3 py-2 text-sm hover:bg-[rgba(255,255,255,0.06)] transition-colors" style={{ color: '#fff' }}>
                            {p.name} <span style={{ color: '#6b7280' }}>({p.stock_quantity ?? 0} in stock)</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Lot number (auto if blank)</label>
                    <input value={line.lot_number} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, lot_number: e.target.value } : l))} placeholder="e.g. 20260428-SUP-001" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Quantity received *</label>
                    <input type="number" min={0} value={line.quantity_received} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, quantity_received: parseInt(e.target.value) || 0 } : l))} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Unit cost (A$)</label>
                    <input type="number" min={0} step={0.01} value={line.unit_cost_cents != null ? (line.unit_cost_cents / 100).toFixed(2) : ''} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, unit_cost_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null } : l))} placeholder="0.00" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Expiry date (required for food)</label>
                    <input type="date" value={line.expiry_date} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, expiry_date: e.target.value } : l))} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Bin location</label>
                    <select value={line.location_id} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, location_id: e.target.value } : l))} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}>
                      <option value="">No location assigned</option>
                      {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.label ?? `${loc.zone}-B${loc.bay}-S${loc.shelf}`}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Condition</label>
                    <select value={line.condition} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, condition: e.target.value as 'Good'|'Damaged'|'Short' } : l))} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}>
                      <option value="Good">Good</option>
                      <option value="Damaged">Damaged</option>
                      <option value="Short">Short</option>
                    </select>
                  </div>
                  {line.condition !== 'Good' && (
                    <div>
                      <label className="block text-xs text-red-400 mb-1">Discrepancy note</label>
                      <input value={line.notes} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, notes: e.target.value } : l))} placeholder="Describe the issue" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fff' }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setLines(ls => [...ls, { ...BLANK_LINE }])} className="text-sm text-[#1D9E75] hover:text-white transition-colors mb-4">+ Add another item</button>

          {/* Sticky footer */}
          <div className="sticky bottom-0 rounded-xl p-4 flex items-center justify-between gap-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-xs" style={{ color: '#9ca3af' }}>
              {lines.filter(l => l.item_id).length} items · {totalUnits} units · A${(totalValueCents / 100).toFixed(2)} estimated
              {discrepancies > 0 && <span className="ml-2 text-amber-400">⚠ {discrepancies} discrepancies</span>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setFlowState('step2')} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>← Back</button>
              <button onClick={handleConfirm} disabled={submitting || lines.every(l => !l.item_id)} className="px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                {submitting ? 'Confirming…' : 'Confirm Receiving'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETE */}
      {flowState === 'complete' && result && (
        <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-1">GRN {result.grn_number} confirmed</h2>
          <p className="text-sm mb-2" style={{ color: '#9ca3af' }}>{result.item_count} items received, stock updated</p>
          {result.has_discrepancy && <p className="text-xs text-amber-400 mb-6">Discrepancies logged — review with supplier</p>}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <button onClick={() => window.print()} className="px-5 py-2.5 rounded-xl text-sm font-medium" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>Print GRN</button>
            <button onClick={resetFlow} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>Receive another</button>
            <Link href="/dashboard/warehouse/stock" className="px-5 py-2.5 rounded-xl text-sm font-medium text-center" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>View stock</Link>
          </div>
        </div>
      )}
    </div>
  );
}
