'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import AriaFloatingPanel from './AriaFloatingPanel'

export default function AriaFloatingButton() {
  const pathname = usePathname() ?? ''
  const [isOpen, setIsOpen] = useState(false)

  // Never render on /pos or any sub-route (POS terminal)
  if (pathname.startsWith('/pos')) return null

  return (
    <>
      {/* Floating sage button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? 'Close Aria' : 'Talk to Aria'}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2D5240 0%, #3d6b55 100%)',
          border: '2px solid rgba(127,184,151,0.4)',
          cursor: 'pointer',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isOpen
            ? '0 4px 20px rgba(45,82,64,0.6)'
            : '0 4px 20px rgba(45,82,64,0.45)',
          animation: isOpen ? 'none' : 'ariaFloatPulse 2.5s ease-in-out infinite',
          transition: 'box-shadow 200ms',
        }}
      >
        {/* Italic Aria "A" mark */}
        <span style={{
          fontFamily: 'var(--font-display, Cormorant, Georgia, serif)',
          fontStyle: 'italic',
          fontSize: 22,
          fontWeight: 600,
          color: '#7FB897',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          {isOpen ? '×' : 'A'}
        </span>
      </button>

      {isOpen && <AriaFloatingPanel onClose={() => setIsOpen(false)} />}

      <style>{`
        @keyframes ariaFloatPulse {
          0%, 100% {
            box-shadow: 0 4px 20px rgba(45,82,64,0.45), 0 0 0 0 rgba(127,184,151,0.35);
          }
          50% {
            box-shadow: 0 4px 20px rgba(45,82,64,0.45), 0 0 0 9px rgba(127,184,151,0);
          }
        }
      `}</style>
    </>
  )
}
