'use client'
import { useState } from 'react'

interface Props {
  onOverridePrice: () => void
  onEditNotes: () => void
  onSetSeat?: () => void
  onSetCourse?: () => void
  onRemove: () => void
  canOverride: boolean
}

export default function CartLineMenu({ onOverridePrice, onEditNotes, onSetSeat, onSetCourse, onRemove, canOverride }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="w-7 h-7 rounded-md flex items-center justify-center text-[rgba(232,237,232,0.5)] hover:bg-[rgba(255,255,255,0.05)]"
        aria-label="Line options"
      >⋮</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-50 bg-[#0e1612] border border-[rgba(127,184,151,0.2)] rounded-xl shadow-xl py-1 min-w-[200px]">
            <button
              onClick={() => { setOpen(false); onOverridePrice() }}
              className="w-full text-left px-3 py-2 text-xs text-[#E8EDE8] hover:bg-[rgba(255,255,255,0.05)]"
              style={{ opacity: canOverride ? 1 : 0.5 }}
            >
              Override price{!canOverride ? ' (no permission)' : ''}
            </button>
            <button
              onClick={() => { setOpen(false); onEditNotes() }}
              className="w-full text-left px-3 py-2 text-xs text-[#E8EDE8] hover:bg-[rgba(255,255,255,0.05)]"
            >
              Edit notes / instructions
            </button>
            {onSetSeat && (
              <button
                onClick={() => { setOpen(false); onSetSeat() }}
                className="w-full text-left px-3 py-2 text-xs text-[#E8EDE8] hover:bg-[rgba(255,255,255,0.05)]"
              >
                Assign seat
              </button>
            )}
            {onSetCourse && (
              <button
                onClick={() => { setOpen(false); onSetCourse() }}
                className="w-full text-left px-3 py-2 text-xs text-[#E8EDE8] hover:bg-[rgba(255,255,255,0.05)]"
              >
                Set course
              </button>
            )}
            <div className="h-px bg-[rgba(127,184,151,0.1)] my-1" />
            <button
              onClick={() => { setOpen(false); onRemove() }}
              className="w-full text-left px-3 py-2 text-xs text-[#FF6B6B] hover:bg-[rgba(255,107,107,0.08)]"
            >
              Remove line
            </button>
          </div>
        </>
      )}
    </div>
  )
}
