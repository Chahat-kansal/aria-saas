'use client'
import { useEffect, useState } from 'react'

interface Props {
  onSelect: (text: string) => void
  disabled?: boolean
}

const FALLBACK = [
  "Where am I losing the most money right now?",
  "Which products should I reorder this week?",
  "How does my revenue compare to last week?",
  "Which customers haven't been back recently?",
]

export default function ChatSuggestions({ onSelect, disabled }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/aria/ask/suggestions')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && Array.isArray(data?.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions.slice(0, 4))
        }
      })
      .catch(() => { /* use fallback */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {(loading ? FALLBACK : suggestions).map((s, i) => (
        <button
          key={i}
          onClick={() => !disabled && onSelect(s)}
          disabled={disabled || loading}
          className="text-left px-4 py-3 rounded-xl text-sm transition-all hover:border-[#7FB897] hover:text-white disabled:opacity-50"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#d1d5db',
          }}
        >
          {loading ? (
            <span className="block h-4 rounded bg-white/10 animate-pulse" style={{ width: (60 + (i * 13) % 35) + "%" }} />
          ) : s}
        </button>
      ))}
    </div>
  )
}
