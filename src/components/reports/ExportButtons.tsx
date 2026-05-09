'use client';
import React, { useState, useEffect, useRef } from 'react';

interface SavedConfig {
  name: string;
  report_type: string;
  group_by?: string;
  period?: string;
  columns?: string[];
  saved_at: string;
  extra?: Record<string, unknown>;
}

interface ExportButtonsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  reportType: string;
  columns?: { key: string; label: string }[];
  filename?: string;
  config?: Record<string, unknown>;
}

const STORAGE_KEY = 'aria-saved-reports';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function downloadCSV(data: any[], filename: string, columns?: { key: string; label: string }[]) {
  if (!data.length) return;
  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0] ?? {});
  const headers = columns ? columns.map(c => c.label) : keys;
  const rows = data.map(row => keys.map(k => {
    const v = row[k];
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','));
  const csv = '﻿' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadSaved(): SavedConfig[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

function saveToDB(cfg: SavedConfig) {
  const existing = loadSaved().filter(c => c.name !== cfg.name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([cfg, ...existing].slice(0, 20)));
}

const btnS: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-default)',
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
  alignItems: 'center', gap: 5,
};

export default function ExportButtons({ data, reportType, columns, filename, config }: ExportButtonsProps) {
  const [savingName, setSavingName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedConfig[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSavedReports(loadSaved().filter(c => c.report_type === reportType));
  }, [reportType]);

  useEffect(() => {
    if (showSaveInput) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [showSaveInput]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function doSave() {
    const name = savingName.trim();
    if (!name) return;
    const cfg: SavedConfig = {
      name,
      report_type: reportType,
      saved_at: new Date().toISOString(),
      ...(config ?? {}),
    };
    saveToDB(cfg);
    setSavedReports(loadSaved().filter(c => c.report_type === reportType));
    setShowSaveInput(false);
    setSavingName('');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }

  function deleteConfig(name: string) {
    const updated = loadSaved().filter(c => c.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSavedReports(updated.filter(c => c.report_type === reportType));
  }

  const exportFilename = filename ?? `report-${reportType}-${new Date().toISOString().slice(0, 10)}`;

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button style={btnS} onClick={() => downloadCSV(data, exportFilename, columns)}>
        📤 Export CSV
      </button>
      <button style={btnS} onClick={() => window.print()}>🖨️ Print</button>

      {showSaveInput ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            ref={inputRef}
            value={savingName}
            onChange={e => setSavingName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') { setShowSaveInput(false); setSavingName(''); } }}
            placeholder="Config name…"
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 140 }}
          />
          <button style={{ ...btnS, background: savingName.trim() ? 'var(--violet)' : 'var(--bg-elevated)', color: savingName.trim() ? '#fff' : 'var(--text-tertiary)', borderColor: 'var(--violet)' }} onClick={doSave}>Save</button>
          <button style={{ ...btnS, padding: '7px 8px' }} onClick={() => { setShowSaveInput(false); setSavingName(''); }}>×</button>
        </div>
      ) : (
        <button
          style={{ ...btnS, color: savedFlash ? '#34D399' : 'var(--text-primary)', borderColor: savedFlash ? '#34D399' : 'var(--border-default)' }}
          onClick={() => { setSavingName(`${reportType} — ${new Date().toLocaleDateString('en-AU')}`); setShowSaveInput(true); }}
        >
          {savedFlash ? '✓ Saved' : '💾 Save'}
        </button>
      )}

      {savedReports.length > 0 && (
        <div ref={dropRef} style={{ position: 'relative' }}>
          <button style={btnS} onClick={() => setShowDropdown(v => !v)}>
            📂 Saved ({savedReports.length})
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 40, background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)', minWidth: 220, padding: '6px 0' }}>
              {savedReports.map(cfg => (
                <div key={cfg.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <div style={{ flex: 1 }} onClick={() => { setShowDropdown(false); }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{cfg.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{new Date(cfg.saved_at).toLocaleDateString('en-AU')}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteConfig(cfg.name); }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
