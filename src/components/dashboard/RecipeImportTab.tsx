'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

interface Ingredient { item: string; quantity: string; unit: string; }
interface ExtractedRecipe { title: string; ingredients: Ingredient[]; steps: string[]; }
interface ImportRow { id: string; source_url: string; source_type: string; extracted_title: string | null; status: string; created_at: string; }
interface ExistingRecipe { id: string; name: string; }
interface FileImportRow { id: string; file_name: string; rows_imported: number; rows_failed: number; imported_at: string; }

const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] focus:border-[rgba(29,158,117,0.4)]';
const accentGreen = '#1D9E75';

function FileImportSection({ businessId, onImported }: { businessId: string; onImported: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number; recipes: { name: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<FileImportRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    const d = await fetch(`/api/pos/recipes/import?business_id=${businessId}`).then(r => r.json()).catch(() => ({}));
    setHistory(d.imports ?? []);
  }, [businessId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function uploadFile(file: File) {
    setUploading(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('business_id', businessId);
    try {
      const res = await fetch('/api/pos/recipes/import', { method: 'POST', body: fd }).then(r => r.json());
      if (res.error) { setError(res.error); }
      else { setResult(res); loadHistory(); onImported(); }
    } catch { setError('Upload failed — please try again.'); }
    setUploading(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div>
        <h3 className="text-white font-medium mb-0.5">Import recipes from file</h3>
        <p className="text-xs" style={{ color: '#6b7280' }}>Upload a CSV, PDF, or photo. Aria extracts recipes automatically.</p>
      </div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className="rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
        style={{ height: 110, border: `2px dashed ${dragging ? accentGreen : 'rgba(255,255,255,0.12)'}`, background: dragging ? 'rgba(29,158,117,0.06)' : 'rgba(255,255,255,0.02)' }}>
        <input ref={fileRef} type="file" accept=".csv,.pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
        {uploading ? (
          <span className="flex items-center gap-2 text-sm" style={{ color: accentGreen }}>
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Importing…
          </span>
        ) : (
          <>
            <span className="text-2xl">📄</span>
            <span className="text-sm font-medium text-white">Drop file or click to browse</span>
            <span className="text-xs" style={{ color: '#6b7280' }}>CSV · PDF · JPG · PNG</span>
          </>
        )}
      </div>
      {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</p>}
      {result && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(29,158,117,0.1)', color: accentGreen }}>
          ✓ Imported {result.imported} recipe{result.imported !== 1 ? 's' : ''}
          {result.failed > 0 && <span style={{ color: '#f59e0b' }}> · {result.failed} failed</span>}
          {result.recipes.length > 0 && <span className="block mt-0.5" style={{ color: '#d1d5db' }}>{result.recipes.map(r => r.name).join(', ')}</span>}
        </div>
      )}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>File import history</p>
          <div className="space-y-1.5">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <span className="text-sm text-white truncate">{h.file_name}</span>
                <span className="text-xs shrink-0" style={{ color: '#6b7280' }}>{h.rows_imported} imported{h.rows_failed > 0 ? ` · ${h.rows_failed} failed` : ''} · {new Date(h.imported_at).toLocaleDateString('en-AU')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecipeImportTab({ businessId, existingRecipes, onImported }: { businessId: string; existingRecipes: ExistingRecipe[]; onImported?: () => void }) {
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedRecipe | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const [compareRecipeId, setCompareRecipeId] = useState('');
  const [comparing, setComparing] = useState(false);
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const res = await fetch(`/api/recipes/import?businessId=${businessId}`).then(r => r.json()).catch(() => ({ imports: [] }));
    setHistory(res.imports ?? []);
    setHistoryLoading(false);
  }, [businessId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function doImport() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setImporting(true);
    setImportError(null);
    setExtracted(null);
    setImportId(null);
    setSuggestions(null);
    setAddedMsg(null);
    try {
      const res = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_url: trimmed, businessId }),
      }).then(r => r.json());
      if (res.error === 'no_recipe_found') { setImportError(res.message); return; }
      if (res.error) { setImportError(res.error); return; }
      setImportId(res.importId ?? null);
      setExtracted(res.recipe ?? null);
      if (!res.recipe) setImportError("Couldn't extract a recipe from that link.");
      else loadHistory();
    } catch { setImportError('Network error — please try again.'); }
    finally { setImporting(false); }
  }

  async function addAsProduct() {
    if (!extracted || !businessId || !importId) return;
    setAddingProduct(true);
    setAddedMsg(null);
    try {
      const res = await fetch('/api/recipes/add-to-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_import_id: importId, businessId }),
      }).then(r => r.json());
      if (res.error) { setAddedMsg('Error: ' + res.error); return; }
      setAddedMsg(`"${extracted.title}" added to your products.`);
    } catch { setAddedMsg('Error saving product.'); }
    finally { setAddingProduct(false); }
  }

  async function doCompare() {
    if (!importId || !compareRecipeId) return;
    setComparing(true);
    setSuggestions(null);
    try {
      const res = await fetch('/api/recipes/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId, existingRecipeId: compareRecipeId, businessId }),
      }).then(r => r.json());
      setSuggestions(res.suggestions ?? null);
    } catch { setSuggestions('Could not compare recipes — please try again.'); }
    finally { setComparing(false); }
  }

  const accentGreen = '#1D9E75';

  return (
    <div className="space-y-6">
      {/* File upload (CSV / PDF / image) */}
      <FileImportSection businessId={businessId} onImported={onImported ?? (() => {})} />

      {/* URL input */}
      <div className="rounded-xl p-5 space-y-3" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <h3 className="text-white font-medium mb-0.5">Import a recipe from any link</h3>
          <p className="text-xs" style={{ color: '#6b7280' }}>
            Aria reads the post&apos;s caption and written description. Videos without a written recipe may not import.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doImport()}
            placeholder="Paste a URL (Instagram, website, blog…)"
            className={inputCls + ' flex-1'}
          />
          <button
            onClick={doImport}
            disabled={importing || !url.trim()}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 shrink-0"
            style={{ background: accentGreen }}>
            {importing ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                Reading…
              </span>
            ) : 'Import'}
          </button>
        </div>
        {importError && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{importError}</p>
        )}
      </div>

      {/* Extracted recipe card */}
      {extracted && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: '#13131a', border: `1px solid rgba(29,158,117,0.25)` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: accentGreen }}>Extracted recipe</p>
              <h3 className="text-white font-semibold text-lg">{extracted.title}</h3>
            </div>
            {addedMsg ? (
              <span className="text-xs px-3 py-1 rounded-full shrink-0" style={{ background: 'rgba(29,158,117,0.15)', color: accentGreen }}>{addedMsg}</span>
            ) : (
              <button
                onClick={addAsProduct}
                disabled={addingProduct || !importId}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-white disabled:opacity-40 shrink-0"
                style={{ background: accentGreen }}>
                {addingProduct ? 'Adding…' : '+ Add as product'}
              </button>
            )}
          </div>

          {extracted.ingredients.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>Ingredients</p>
              <div className="flex flex-wrap gap-1.5">
                {extracted.ingredients.map((ing, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#d1d5db' }}>
                    {ing.item} {ing.quantity && `${ing.quantity} ${ing.unit}`.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {extracted.steps.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>Steps</p>
              <ol className="space-y-1.5">
                {extracted.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-sm" style={{ color: '#d1d5db' }}>
                    <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'rgba(29,158,117,0.2)', color: accentGreen }}>{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Compare section */}
          {existingRecipes.length > 0 && importId && (
            <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-medium mb-2" style={{ color: '#9ca3af' }}>Compare to an existing recipe</p>
              <div className="flex gap-2">
                <select
                  value={compareRecipeId}
                  onChange={e => setCompareRecipeId(e.target.value)}
                  className={inputCls + ' flex-1'}>
                  <option value="" style={{ background: '#13131a' }}>Select recipe…</option>
                  {existingRecipes.map(r => (
                    <option key={r.id} value={r.id} style={{ background: '#13131a' }}>{r.name}</option>
                  ))}
                </select>
                <button
                  onClick={doCompare}
                  disabled={comparing || !compareRecipeId}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium disabled:opacity-40 shrink-0"
                  style={{ background: 'rgba(29,158,117,0.1)', color: accentGreen, border: '1px solid rgba(29,158,117,0.25)' }}>
                  {comparing ? (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                      Comparing…
                    </span>
                  ) : '✦ Compare'}
                </button>
              </div>
              {suggestions && (
                <div className="mt-3 rounded-xl p-4 text-sm whitespace-pre-wrap" style={{ background: 'rgba(29,158,117,0.06)', color: '#d1d5db', border: '1px solid rgba(29,158,117,0.15)' }}>
                  <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: accentGreen }}>✦ Aria&apos;s suggestions</p>
                  {suggestions}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import history */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>Recent imports</p>
        {historyLoading ? (
          <div className="h-20 rounded-xl animate-pulse" style={{ background: '#13131a' }} />
        ) : history.length === 0 ? (
          <p className="text-sm" style={{ color: '#4b5563' }}>No imports yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map(row => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{row.extracted_title ?? row.source_url}</p>
                  <p className="text-xs truncate" style={{ color: '#4b5563' }}>{row.source_url}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full shrink-0 capitalize" style={{
                  background: row.status === 'extracted' ? 'rgba(29,158,117,0.1)' : row.status === 'failed' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.07)',
                  color: row.status === 'extracted' ? accentGreen : row.status === 'failed' ? '#ef4444' : '#9ca3af',
                }}>{row.status.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
