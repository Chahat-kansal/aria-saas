import React from 'react'

export const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: 'none', borderRadius: 8,
  padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none',
  fontFamily: "'Manrope',sans-serif", boxSizing: 'border-box',
}

export const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em',
}

export function field(label: string, children: React.ReactNode) {
  return (
    <div style={{ marginBottom: 0 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <button onClick={() => onChange(!checked)} type="button" style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: checked ? 'var(--violet)' : 'var(--bg-elevated)', position: 'relative', transition: 'background 200ms',
      }}>
        <div style={{ position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 200ms' }} />
      </button>
      {label && <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>}
    </label>
  )
}
