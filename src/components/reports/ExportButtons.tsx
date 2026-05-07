'use client';
import React from 'react';

interface ExportButtonsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  reportType: string;
  columns?: { key: string; label: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function downloadCSV(data: any[], reportType: string, columns?: { key: string; label: string }[]) {
  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0] ?? {});
  const headers = columns ? columns.map(c => c.label) : keys;
  const rows = data.map(row => keys.map(k => {
    const v = row[k];
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','));
  const bom = '﻿';
  const csv = bom + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${reportType}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const btnS: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-default)',
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
  alignItems: 'center', gap: 5,
};

export default function ExportButtons({ data, reportType, columns }: ExportButtonsProps) {
  function saveConfig() {
    const name = window.prompt('Save config as:', `${reportType} — ${new Date().toLocaleDateString('en-AU')}`);
    if (!name) return;
    const existing = JSON.parse(localStorage.getItem('aria-saved-reports') ?? '{}');
    existing[reportType] = { ...existing[reportType], [name]: { savedAt: new Date().toISOString() } };
    localStorage.setItem('aria-saved-reports', JSON.stringify(existing));
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button style={btnS} onClick={() => downloadCSV(data, reportType, columns)}>📤 Export CSV</button>
      <button style={btnS} onClick={() => window.print()}>🖨️ Print</button>
      <button style={btnS} onClick={saveConfig}>💾 Save</button>
    </div>
  );
}
