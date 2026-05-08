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
  // Optional controlled sort — when provided, overrides internal sort state
  sortField?: string | null;
  sortDir?: 'asc' | 'desc';
  onSort?: (field: string, dir: 'asc' | 'desc') => void;
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

// Sticky first-column styles — background must be set per-row to match alternating colors
const stickyHdr: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 2,
  background: '#29b6f6', // same as header
  boxShadow: '2px 0 6px rgba(0,0,0,0.18)',
};

function stickyTd(rowBg: string): React.CSSProperties {
  return {
    position: 'sticky',
    left: 0,
    zIndex: 1,
    background: rowBg,
    boxShadow: '2px 0 4px rgba(0,0,0,0.08)',
  };
}

export default function ReportTable({
  columns, rows, groupBy, totalsRow, onRowClick, loading,
  emptyIcon = '📋', emptyMessage = 'No data found.',
  sortField: extSortField, sortDir: extSortDir, onSort,
}: ReportTableProps) {
  const [intSortKey, setIntSortKey] = useState<string | null>(null);
  const [intSortAsc, setIntSortAsc] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const controlled = onSort !== undefined;
  const sortKey = controlled ? (extSortField ?? null) : intSortKey;
  const sortAsc = controlled ? (extSortDir === 'asc') : intSortAsc;

  function handleSort(key: string) {
    if (controlled) {
      const nextDir: 'asc' | 'desc' = sortKey === key && extSortDir === 'desc' ? 'asc' : 'desc';
      onSort!(key, nextDir);
    } else {
      if (intSortKey === key) setIntSortAsc(a => !a);
      else { setIntSortKey(key); setIntSortAsc(true); }
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
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

  function renderCell(col: Column, row: Record<string, unknown>, ci: number, rowBg: string) {
    const v = row[col.key];
    const content = col.format ? col.format(v, row) : (v == null ? '—' : String(v));
    const extra = ci === 0 ? stickyTd(rowBg) : {};
    return (
      <td key={col.key} className="rpt-cell" style={{ ...cell, textAlign: col.align ?? 'left', width: col.width, ...extra }} onClick={() => onRowClick?.(row)}>
        {content}
      </td>
    );
  }

  function renderRow(row: Record<string, unknown>, i: number, indent?: boolean) {
    const rowBg = i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)';
    return (
      <tr key={i}
        onClick={() => onRowClick?.(row)}
        style={{ background: rowBg, cursor: onRowClick ? 'pointer' : 'default' }}
        onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = rowBg; }}>
        {columns.map((col, ci) => {
          if (indent && ci === 0) {
            const v = row[col.key];
            const content = col.format ? col.format(v, row) : (v == null ? '—' : String(v));
            return (
              <td key={col.key} className="rpt-cell" style={{ ...cell, ...stickyTd(rowBg), textAlign: col.align ?? 'left', width: col.width, paddingLeft: 24 }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>├</span>{content}
              </td>
            );
          }
          return renderCell(col, row, ci, rowBg);
        })}
      </tr>
    );
  }

  return (
    <>
      <style>{`
        @keyframes rt-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @media (max-width: 768px) {
          .rpt-cell { font-size: 12px !important; padding: 6px 8px !important; }
          .rpt-hdr  { font-size: 11px !important; padding: 8px !important; }
        }
      `}</style>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        {/* Horizontal scroll wrapper — enables mobile swipe */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          <table style={{ minWidth: 700, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {columns.map((col, ci) => (
                  <th key={col.key} className="rpt-hdr"
                    style={{ ...hdr, textAlign: col.align ?? 'left', cursor: col.sortable ? 'pointer' : 'default', width: col.width, ...(ci === 0 ? stickyHdr : {}) }}
                    onClick={() => col.sortable && handleSort(col.key)}>
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
                      <td key={col.key} className="rpt-cell" style={cell}>
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
                    <td key={col.key} className="rpt-cell" style={{ ...totalsCell, textAlign: col.align ?? 'left', ...(i === 0 ? { position: 'sticky', left: 0, background: 'rgba(41,182,246,0.18)', zIndex: 1 } : {}) }}>
                      {i === 0 ? 'Total' : (totalsRow[col.key] != null ? (col.format ? col.format(totalsRow[col.key], totalsRow) : String(totalsRow[col.key])) : '')}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
