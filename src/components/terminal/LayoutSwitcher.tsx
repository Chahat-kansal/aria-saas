'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LAYOUTS, TerminalLayout, setCurrentLayout } from '@/lib/terminal/layouts'
import { ChevronDown } from 'lucide-react'

interface Props {
  current: TerminalLayout
  onChange: (next: TerminalLayout) => void
}

export function LayoutSwitcher({ current, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const config = LAYOUTS[current]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [open])

  const handleSelect = (layout: TerminalLayout) => {
    setCurrentLayout(layout)
    onChange(layout)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        title={`Layout: ${config.label}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px',
          background: 'rgba(127,184,151,0.06)',
          border: '1px solid rgba(127,184,151,0.15)',
          borderRadius: 8, color: 'var(--text-secondary)',
          fontSize: 11, cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 13 }}>{config.icon}</span>
        <span>{config.label}</span>
        <ChevronDown size={11} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              width: 280,
              background: 'var(--bg-elevated)',
              backdropFilter: 'blur(20px)',
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(127,184,151,0.12)',
              zIndex: 200,
            }}
          >
            <div style={{
              padding: '10px 12px', fontSize: 10, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.16em',
              color: 'var(--text-tertiary)',
            }}>
              Choose layout
            </div>
            {Object.values(LAYOUTS).map(layout => {
              const isActive = layout.id === current
              return (
                <button
                  key={layout.id}
                  onClick={() => handleSelect(layout.id)}
                  onTouchStart={e => { e.currentTarget.style.background = 'rgba(127,184,151,0.06)' }}
                  onTouchEnd={e => { e.currentTarget.style.background = isActive ? 'rgba(127,184,151,0.08)' : 'transparent' }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '14px 12px', cursor: 'pointer', textAlign: 'left',
                    color: 'var(--text-primary)', border: 'none',
                    background: isActive ? 'rgba(127,184,151,0.08)' : 'transparent',
                    transition: 'background 150ms', minHeight: 56,
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span style={{
                    fontSize: 22, flexShrink: 0, lineHeight: 1,
                    color: isActive ? 'var(--violet)' : 'var(--text-secondary)',
                  }}>{layout.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{layout.label}</span>
                      <span style={{ fontSize: 9, color: 'var(--violet)', fontWeight: 500 }}>{layout.speed}</span>
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '2px 0 0', lineHeight: 1.4 }}>
                      {layout.description}
                    </p>
                  </div>
                </button>
              )
            })}
            <div style={{
              padding: '8px 12px', fontSize: 9, color: 'var(--text-tertiary)',
              borderTop: '1px solid rgba(127,184,151,0.08)', lineHeight: 1.4,
            }}>
              Choice persists per device. Owner sets the default.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
