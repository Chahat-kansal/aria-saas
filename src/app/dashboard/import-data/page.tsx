'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, UploadCloud, XCircle } from 'lucide-react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

type UploadType = 'products' | 'sales' | 'inventory' | 'supplier_costs';
type CsvRow = Record<string, string>;

const UPLOAD_TYPES: { value: UploadType; label: string; fields: string[] }[] = [
  { value: 'products', label: 'Products CSV', fields: ['Product name', 'SKU/barcode', 'Category', 'Cost price', 'Sell price'] },
  { value: 'sales', label: 'Sales CSV', fields: ['Sale date', 'Product/SKU', 'Quantity', 'Sale total', 'Discount'] },
  { value: 'inventory', label: 'Inventory CSV', fields: ['Product/SKU', 'Stock on hand', 'Reorder point', 'Location'] },
  { value: 'supplier_costs', label: 'Supplier cost CSV', fields: ['Supplier', 'Product/SKU', 'Unit cost', 'Invoice date'] },
];

const FIELD_OPTIONS = [
  'Ignore column',
  'Product name',
  'SKU/barcode',
  'Category',
  'Supplier',
  'Sale date',
  'Quantity',
  'Stock on hand',
  'Reorder point',
  'Cost price',
  'Sell price',
  'Unit cost',
  'Sale total',
  'Discount',
  'Invoice date',
  'Location',
];

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      if (row.some(cell => cell.length > 0)) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(cell => cell.length > 0)) rows.push(row);
  const [headers, ...body] = rows;
  if (!headers?.length) return [];
  return body.map(values => Object.fromEntries(headers.map((header, index) => [header || `Column ${index + 1}`, values[index] ?? ''])));
}

export default function ImportDataPage() {
  const { business } = useBusinessContext();
  const [uploadType, setUploadType] = useState<UploadType>('sales');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const columns = useMemo(() => Object.keys(rows[0] ?? {}), [rows]);
  const preview = rows.slice(0, 5);
  const selectedType = UPLOAD_TYPES.find(type => type.value === uploadType)!;

  async function handleFile(file: File) {
    setStatus(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    setMapping(Object.fromEntries(Object.keys(parsed[0] ?? {}).map(column => [column, guessMapping(column)])));
  }

  async function saveImport() {
    if (!business?.id) {
      setStatus({ type: 'error', message: 'Select a business before importing data.' });
      return;
    }
    if (!rows.length) {
      setStatus({ type: 'error', message: 'Choose a CSV file with at least one data row.' });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          upload_type: uploadType,
          file_name: fileName,
          columns,
          rows,
          mapping,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setStatus({ type: 'success', message: `${data.imported_file?.row_count ?? rows.length} rows imported. Aria can now use this for your briefing.` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Import failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-full bg-[#0f0f13] p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="mb-3 inline-flex items-center gap-2 text-xs text-white/40 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to dashboard
            </Link>
            <h1 className="text-2xl font-semibold text-white">Import historical data</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/45">
              Import CSV files to migrate historical data from a previous POS system. For live intelligence, use Aria POS or connect your existing POS.
            </p>
          </div>
          <Link href="/pos" className="inline-flex items-center justify-center rounded-xl bg-[#1D9E75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#188765]">
            Open Aria POS
          </Link>
        </div>

        <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-3 text-sm font-semibold text-white">Upload type</p>
            <div className="space-y-2">
              {UPLOAD_TYPES.map(type => (
                <button
                  key={type.value}
                  onClick={() => setUploadType(type.value)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${uploadType === type.value ? 'border-[#1D9E75]/50 bg-[#1D9E75]/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
                >
                  <p className="text-sm font-medium text-white">{type.label}</p>
                  <p className="mt-1 text-[11px] text-white/35">{type.fields.join(' · ')}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="space-y-4">
            <label
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center hover:bg-white/[0.05]"
            >
              <UploadCloud className="mb-3 h-10 w-10 text-[#8ff1c9]" />
              <p className="text-base font-semibold text-white">Drop your {selectedType.label.toLowerCase()} here</p>
              <p className="mt-1 text-sm text-white/40">or choose a CSV file from your computer</p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>

            {fileName && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-[#8ff1c9]" />
                    <div>
                      <p className="text-sm font-semibold text-white">{fileName}</p>
                      <p className="text-xs text-white/35">{rows.length} rows detected · {columns.length} columns found</p>
                    </div>
                  </div>
                  <button
                    onClick={saveImport}
                    disabled={saving || !rows.length}
                    className="rounded-xl bg-[#1D9E75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#188765] disabled:cursor-wait disabled:opacity-50"
                  >
                    {saving ? 'Importing...' : 'Save import'}
                  </button>
                </div>
              </div>
            )}

            {columns.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h2 className="text-sm font-semibold text-white">Column mapping</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {columns.map(column => (
                    <label key={column} className="block">
                      <span className="mb-1 block text-xs text-white/40">{column}</span>
                      <select
                        value={mapping[column] ?? 'Ignore column'}
                        onChange={event => setMapping(prev => ({ ...prev, [column]: event.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-[#11131a] px-3 py-2 text-sm text-white outline-none focus:border-[#1D9E75]/60"
                      >
                        {FIELD_OPTIONS.map(option => <option key={option}>{option}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {preview.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                <div className="border-b border-white/10 p-4">
                  <h2 className="text-sm font-semibold text-white">Preview first 5 rows</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-black/25 text-white/45">
                      <tr>{columns.map(column => <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">{column}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.map((row, index) => (
                        <tr key={index} className="border-t border-white/5">
                          {columns.map(column => <td key={column} className="max-w-52 truncate px-3 py-2 text-white/65">{row[column]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {status && (
              <div className={`flex items-start gap-3 rounded-2xl border p-4 ${status.type === 'success' ? 'border-[#1D9E75]/30 bg-[#1D9E75]/10' : 'border-red-400/25 bg-red-500/10'}`}>
                {status.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#8ff1c9]" /> : <XCircle className="mt-0.5 h-5 w-5 text-red-300" />}
                <div>
                  <p className="text-sm font-semibold text-white">{status.type === 'success' ? 'Import complete' : 'Import failed'}</p>
                  <p className="mt-1 text-sm text-white/55">{status.message}</p>
                  {status.type === 'success' && <Link href="/dashboard" className="mt-3 inline-flex text-sm font-semibold text-[#8ff1c9] hover:underline">Go to dashboard →</Link>}
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function guessMapping(column: string) {
  const c = column.toLowerCase();
  if (c.includes('sku') || c.includes('barcode')) return 'SKU/barcode';
  if (c.includes('product') || c.includes('item') || c.includes('name')) return 'Product name';
  if (c.includes('supplier')) return 'Supplier';
  if (c.includes('qty') || c.includes('quantity')) return 'Quantity';
  if (c.includes('stock')) return 'Stock on hand';
  if (c.includes('cost')) return 'Cost price';
  if (c.includes('price')) return 'Sell price';
  if (c.includes('date')) return 'Sale date';
  if (c.includes('discount')) return 'Discount';
  if (c.includes('category')) return 'Category';
  return 'Ignore column';
}
