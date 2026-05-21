'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Table {
  id: string;
  table_number: string;
  seats: number;
  zone: string;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  current_sale_id: string | null;
  x_position: number;
  y_position: number;
  shape: 'rectangle' | 'circle';
  opened_at?: string;
  running_total?: number;
}

const STATUS_COLOR: Record<string, string> = {
  available: '#16a34a',
  occupied: '#dc2626',
  reserved: '#d97706',
  cleaning: '#6b7280',
};

const STATUS_BG: Record<string, string> = {
  available: 'rgba(22,163,74,0.1)',
  occupied: 'rgba(220,38,38,0.1)',
  reserved: 'rgba(217,119,6,0.1)',
  cleaning: 'rgba(107,114,128,0.1)',
};

const ZONES = ['All', 'Main', 'Bar', 'Outdoor', 'Private'];

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [zone, setZone] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{ table_number: string; seats: string; zone: string; shape: 'rectangle' | 'circle' }>({ table_number: '', seats: '4', zone: 'Main', shape: 'rectangle' });
  const [saving, setSaving] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pos/tables');
      if (res.ok) { const d = await res.json(); setTables(d.tables ?? []); }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addTable() {
    if (!form.table_number.trim()) return;
    setSaving(true);
    await fetch('/api/pos/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, seats: parseInt(form.seats) || 4 }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ table_number: '', seats: '4', zone: 'Main', shape: 'rectangle' });
    load();
  }

  async function updateStatus(tableId: string, status: string) {
    setUpdatingStatus(true);
    await fetch(`/api/pos/tables/${tableId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setUpdatingStatus(false);
    setSelectedTable(null);
    load();
  }

  const filtered = zone === 'All' ? tables : tables.filter(t => t.zone === zone);
  const zones = ['All', ...Array.from(new Set(tables.map(t => t.zone).filter(Boolean)))];

  const inputCls = 'w-full bg-[rgba(0,0,0,0.04)] border border-[rgba(0,0,0,0.12)] rounded-xl px-3 py-2 text-sm text-[#1a1a16] outline-none focus:border-[#2563eb] transition-colors';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Table Management</h1>
          <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">
            {tables.filter(t => t.status === 'occupied').length} occupied ·{' '}
            {tables.filter(t => t.status === 'available').length} available ·{' '}
            {tables.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/pos/kitchen" className="px-3 py-2 rounded-xl text-xs font-medium border border-[rgba(0,0,0,0.1)] text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.04)] transition-colors">
            Kitchen →
          </Link>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#006AFF' }}>
            + Add table
          </button>
        </div>
      </div>

      {/* Zone filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {zones.map(z => (
          <button key={z} onClick={() => setZone(z)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${zone === z ? 'bg-[#2563eb] text-white' : 'bg-[rgba(0,0,0,0.05)] text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.08)]'}`}>
            {z}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-[rgba(0,0,0,0.05)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-10 text-center">
          <p className="text-4xl mb-3">🪑</p>
          <p className="text-sm font-semibold text-[#1a1a16] mb-1">No tables yet</p>
          <p className="text-xs text-[rgba(26,26,22,0.4)] mb-4">Add tables to manage your floor plan.</p>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: '#006AFF' }}>
            Add your first table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filtered.map(table => (
            <button key={table.id} onClick={() => setSelectedTable(table)}
              className="rounded-xl p-4 text-left transition-all hover:shadow-md active:scale-95"
              style={{
                background: '#fff',
                border: `2px solid ${STATUS_COLOR[table.status]}44`,
                boxShadow: table.status === 'occupied' ? `0 0 0 2px ${STATUS_COLOR[table.status]}33` : undefined,
              }}>
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl font-black text-[#1a1a16]">{table.table_number}</span>
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1`}
                  style={{ background: STATUS_COLOR[table.status] }} />
              </div>
              <p className="text-[10px] text-[rgba(26,26,22,0.5)] capitalize">{table.status}</p>
              <p className="text-[10px] text-[rgba(26,26,22,0.35)]">{table.seats} seats · {table.zone}</p>
              {table.status === 'occupied' && table.running_total != null && (
                <p className="text-xs font-semibold mt-1" style={{ color: STATUS_COLOR.occupied }}>
                  A${table.running_total.toFixed(2)}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Table detail modal */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,0.08)]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#1a1a16]">Table {selectedTable.table_number}</h2>
                <button onClick={() => setSelectedTable(null)} className="text-[rgba(26,26,22,0.4)] hover:text-[#1a1a16] text-xl leading-none">×</button>
              </div>
              <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">
                {selectedTable.seats} seats · {selectedTable.zone} ·{' '}
                <span style={{ color: STATUS_COLOR[selectedTable.status] }}>{selectedTable.status}</span>
              </p>
            </div>
            <div className="px-6 py-4 space-y-2">
              {selectedTable.status === 'available' && (
                <Link href={`/pos/terminal?table_id=${selectedTable.id}&table_label=${encodeURIComponent('Table ' + selectedTable.table_number)}`}
                  className="flex items-center justify-center w-full py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
                  style={{ background: '#006AFF' }}
                  onClick={() => setSelectedTable(null)}>
                  Open Table / Start Order
                </Link>
              )}
              {selectedTable.status === 'occupied' && (
                <Link href={`/pos/terminal?table_id=${selectedTable.id}&table_label=${encodeURIComponent('Table ' + selectedTable.table_number)}`}
                  className="flex items-center justify-center w-full py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
                  style={{ background: '#2563eb' }}
                  onClick={() => setSelectedTable(null)}>
                  View / Add Items
                </Link>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(['available', 'occupied', 'reserved', 'cleaning'] as const)
                  .filter(s => s !== selectedTable.status)
                  .map(s => (
                    <button key={s} onClick={() => updateStatus(selectedTable.id, s)}
                      disabled={updatingStatus}
                      className="py-2 rounded-xl text-xs font-medium transition-colors capitalize disabled:opacity-50"
                      style={{ background: `${STATUS_BG[s]}`, color: STATUS_COLOR[s], border: `1px solid ${STATUS_COLOR[s]}33` }}>
                      Mark {s}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add table modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1a1a16]">Add table</h2>
              <button onClick={() => setShowAdd(false)} className="text-[rgba(26,26,22,0.4)] hover:text-[#1a1a16] text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,0.6)] mb-1.5">Table number / name *</label>
                <input value={form.table_number} onChange={e => setForm(f => ({ ...f, table_number: e.target.value }))}
                  className={inputCls} placeholder="e.g. 1, 2A, Bar 1" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,0.6)] mb-1.5">Seats</label>
                  <input type="number" min={1} value={form.seats} onChange={e => setForm(f => ({ ...f, seats: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,0.6)] mb-1.5">Zone</label>
                  <input value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))}
                    className={inputCls} placeholder="Main" list="zones-list" />
                  <datalist id="zones-list">
                    {ZONES.slice(1).map(z => <option key={z} value={z} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,0.6)] mb-1.5">Shape</label>
                <div className="flex gap-2">
                  {(['rectangle', 'circle'] as const).map(s => (
                    <button key={s} onClick={() => setForm(f => ({ ...f, shape: s }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium capitalize transition-colors ${form.shape === s ? 'bg-[#2563eb] text-white' : 'bg-[rgba(0,0,0,0.05)] text-[rgba(26,26,22,0.6)]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[rgba(0,0,0,0.1)] text-[rgba(26,26,22,0.5)]">
                Cancel
              </button>
              <button onClick={addTable} disabled={saving || !form.table_number.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: '#006AFF' }}>
                {saving ? 'Adding…' : 'Add table'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
