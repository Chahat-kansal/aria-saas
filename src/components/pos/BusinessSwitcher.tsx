'use client'
import { useState } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

export default function BusinessSwitcher() {
  const { business, allBusinesses, switchBusiness } = useBusinessContext()
  const [open, setOpen] = useState(false)
  if (!business || allBusinesses.length < 2) return null
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'transparent', border: 'none', color: 'rgba(26,26,22,0.6)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', width: '100%', textAlign: 'left' }}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 13, height: 13, flexShrink: 0 }}>
          <path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" clipRule="evenodd"/>
        </svg>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{business.name}</span>
        <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: 4, zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginBottom: 4 }}>
          {allBusinesses.map(b => (
            <button
              key={b.id}
              onClick={async () => { await switchBusiness(b.id); setOpen(false); }}
              style={{ width: '100%', padding: '7px 10px', textAlign: 'left', background: b.id === business.id ? 'rgba(37,99,235,0.08)' : 'transparent', border: 'none', borderRadius: 6, color: b.id === business.id ? '#2563eb' : 'rgba(26,26,22,0.7)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'block' }}
            >
              {b.name}
              {b.industry && <span style={{ opacity: 0.5, marginLeft: 4 }}>· {b.industry}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
