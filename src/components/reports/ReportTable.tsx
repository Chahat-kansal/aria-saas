'use client';
import React, { useState, useMemo } from 'react';

export interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  format?: (v: unknown, row: Record<string, unknown>) => React.ReactNode;
  width?: string | number;
}

interface ReportTableProps {
  columns: Column[];
  rows: Record<string, unknown>[];
  groupBy?: string;
  totalsRow?: Record<string, unknown>;
  onRowClick?: (row: Record<string, unknown>) => void;
  loading?: boolean;
  emptyIcon?: string;
  emptyMessage?: string;
}

const hdr: React.CSSProperties = {
  padding: '11px 14px',
  background: '#29b6f6',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  textAlign: 'left',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  borderBottom: 'none',
};
const cell: React.CSSProperties = { padding: '12px 14px', fontSize: 13, verticalAlign: 'middle', color: 'var(--text-primary)' };
const totalsCell: React.CSSProperties = { ...cell, fontWeight: 700, background: 'rgba(41,182,246,0.10)', color: 'var(--text-primary)' };

const shimmerBar: React.CSSProperties = {
  height: 13, borderRadius: 4,
  background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-overlay) 50%, var(--bg-elevated) 75%)',
  backgroundSize: '200% 100%', animation: 'rt-shimmer 1.4s infinite',
};

export default function ReportTable({ columns, rows, groupBy, totalsRow, onRowClick, loading, emptyIcon = '📋', emptyMessage = 'No data found.' }: ReportTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [rows, sortKey, sortAsc]);

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, Record<string, unknown>[]>();
    for (const r of sorted) {
      const key = String(r[groupBy] ?? 'Other');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [sorted, groupBy]);

  function renderCell(col: Column, row: Record<string, unknown>) {
    const v = row[col.key];
    const content = col.format ? col.format(v, row) : (v == null ? '—' : String(v));
    return (
      <td key={col.key} style={{ ...cell, textAlign: col.align ?? 'left', width: col.width }} onClick={() => onRowClick?.(row)}>
        {content}
      </td>
    );
  }

  function renderRow(row: Record<string, unknown>, i: number, indent?: boolean) {
    return (
      <tr key={i}
        onClick={() => onRowClick?.(row)}
        style={{
          background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)',
          cursor: onRowClick ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)'; }}>
        {columns.map((col, ci) => {
          if (indent && ci === 0) {
            const v = row[col.key];
            const content = col.format ? col.format(v, row) : (v == null ? '—' : String(v));
            return (
              <td key={col.key} style={{ ...cell, textAlign: col.align ?? 'left', width: col.width, paddingLeft: 24 }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>├</span>{content}
              </td>
            );
          }
          return renderCell(col, row);
        })}
      </tr>
    );
  }

  return (
    <>
      <style>{`@keyframes rt-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{ ...hdr, textAlign: col.align ?? 'left', cursor: col.sortable ? 'pointer' : 'default', width: col.width }}
                  onClick={() => col.sortable && toggleSort(col.key)}>
                  {col.label}
                  {col.sortable && (
                    <span style={{ marginLeft: 4, opacity: sortKey === col.key ? 1 : 0.4 }}>
                      {sortKey === col.key ? (sortAsc ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                  {columns.map(col => (
                    <td key={col.key} style={cell}>
                      <div style={{ ...shimmerBar, width: `${50 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{emptyIcon}</div>
                  {emptyMessage}
                </td>
              </tr>
            ) : grouped ? (
              Array.from(grouped.entries()).map(([groupName, groupRows]) => (
                <React.Fragment key={groupName}>
                  <tr style={{ background: 'var(--bg-overlay)', cursor: 'pointer' }} onClick={() => setCollapsed(c => { const n = new Set(c); n.has(groupName) ? n.delete(groupName) : n.add(groupName); return n; })}>
                    <td colSpan={columns.length} style={{ ...cell, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {collapsed.has(groupName) ? '▶' : '▼'} {groupName} <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 11 }}>({groupRows.length})</span>
                    </td>
                  </tr>
                  {!collapsed.has(groupName) && groupRows.map((row, i) => renderRow(row, i, true))}
                </React.Fragment>
              ))
            ) : (
              sorted.map((row, i) => renderRow(row, i))
            )}
            {totalsRow && !loading && (
              <tr>
                {columns.map((col, i) => (
                  <td key={col.key} style={{ ...totalsCell, textAlign: col.align ?? 'left' }}>
                    {i === 0 ? 'Total' : (totalsRow[col.key] != null ? (col.format ? col.format(totalsRow[col.key], totalsRow) : String(totalsRow[col.key])) : '')}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
