'use client'
import { useState, useEffect, useRef } from 'react'

interface Props {
  productName: string
  originalPrice: number
  currentPrice: number
  onConfirm: (newPrice: number, reason: string) => void
  onCancel: () => void
  canOverride: boolean
}

const REASON_PRESETS = [
  'Damaged item',
  'Price match',
  'Manager override',
  'Customer complaint resolution',
  'Staff purchase',
  'Wrong price tag',
  'Other (specify below)',
]

export default function PriceOverrideModal({ productName, originalPrice, currentPrice, onConfirm, onCancel, canOverride }: Props) {
  const [price, setPrice] = useState(currentPrice.toFixed(2))
  const [reason, setReason] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  if (!canOverride) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
        <div className="bg-[#0e1612] border border-[rgba(127,184,151,0.15)] rounded-2xl p-6 max-w-sm text-[#E8EDE8]" onClick={e => e.stopPropagation()}>
          <h2 className="text-lg font-semibold mb-2">Permission required</h2>
          <p className="text-sm text-[rgba(232,237,232,0.7)] mb-4">You don&apos;t have permission to override prices. Ask a manager.</p>
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm bg-[#2D5240] text-[#7FB897]">OK</button>
        </div>
      </div>
    )
  }

  const newPrice = parseFloat(price) || 0
  const delta = newPrice - (Number(originalPrice) || 0)

  function submit() {
    if (!reason.trim()) { alert('A reason is required for price override.'); return }
    if (newPrice <= 0) { alert('Price must be greater than zero.'); return }
    onConfirm(+(newPrice).toFixed(2), reason.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-[#0e1612] border border-[rgba(127,184,151,0.15)] rounded-2xl p-6 w-full max-w-md text-[#E8EDE8]" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Override price</h2>
        <div className="text-xs text-[rgba(232,237,232,0.5)] mb-4">
          {productName} — original ${(Number(originalPrice) || 0).toFixed(2)}
        </div>

        <label className="block text-xs mb-1 text-[rgba(232,237,232,0.7)]">New unit price</label>
        <input
          ref={inputRef}
          type="number" step="0.01" min={0.01}
          value={price}
          onChange={e => setPrice(e.target.value)}
          className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-2 text-lg font-semibold text-[#E8EDE8] mb-1"
        />
        {Math.abs(delta) > 0.005 && (
          <div className={`text-xs mb-3 ${delta < 0 ? 'text-[#7FB897]' : 'text-[#FFB347]'}`}>
            {delta < 0
              ? `Discount of $${Math.abs(delta).toFixed(2)} (${(Number(originalPrice) > 0 ? (Math.abs(delta) / Number(originalPrice)) * 100 : 0).toFixed(1)}%)`
              : `Premium of $${delta.toFixed(2)}`}
          </div>
        )}

        <label className="block text-xs mb-1 text-[rgba(232,237,232,0.7)]">Reason *</label>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {REASON_PRESETS.map(r => (
            <button
              key={r} type="button"
              onClick={() => setReason(r)}
              className={`text-xs px-2 py-1.5 rounded-lg border text-left transition ${
                reason === r
                  ? 'bg-[rgba(127,184,151,0.15)] border-[#7FB897]'
                  : 'bg-[rgba(255,255,255,0.03)] border-[rgba(127,184,151,0.15)] text-[rgba(232,237,232,0.85)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Or type a custom reason"
          className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-2 text-sm text-[#E8EDE8] placeholder:text-[rgba(232,237,232,0.3)] mb-4"
        />

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm border border-[rgba(127,184,151,0.2)] text-[rgba(232,237,232,0.7)]">Cancel</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#2D5240] text-[#7FB897]">Apply override</button>
        </div>
      </div>
    </div>
  )
}
