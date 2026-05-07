'use client';
import React from 'react';

interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function ReportHeader({ title, subtitle, filters, actions }: ReportHeaderProps) {
  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 20,
      background: 'var(--bg-base)',
      paddingBottom: 0,
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px 0', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: "'Manrope',sans-serif" }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      {filters && (
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--divider)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {filters}
        </div>
      )}
    </div>
  );
}
