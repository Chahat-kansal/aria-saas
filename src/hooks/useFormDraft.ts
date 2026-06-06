import { useState, useEffect, useRef } from 'react'

/**
 * useFormDraft — persists any serialisable form state to sessionStorage.
 * Survives tab navigation within the same session; clears when the window closes.
 *
 * Usage:
 *   const { draft, setDraft, clearDraft, wasRestored } = useFormDraft('my_form_key', defaultState)
 *
 * - `draft` — current state (restored from session if available, else defaultState)
 * - `setDraft(partial)` — merge-update draft (like setState for objects)
 * - `clearDraft()` — remove session entry (call on successful submit)
 * - `wasRestored` — true if state was loaded from a previous session
 */
export function useFormDraft<T extends object>(
  key: string,
  defaultState: T,
  options?: { disabled?: boolean }
): {
  draft: T
  setDraft: (update: Partial<T> | ((prev: T) => T)) => void
  clearDraft: () => void
  wasRestored: boolean
} {
  const restored = useRef(false)
  const [wasRestored, setWasRestored] = useState(false)

  const readSession = (): T | null => {
    if (options?.disabled) return null
    try {
      const raw = sessionStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      // Expire after 24 hours
      if (parsed._savedAt && Date.now() - parsed._savedAt > 86400000) {
        sessionStorage.removeItem(key)
        return null
      }
      const { _savedAt: _, ...data } = parsed
      return data as T
    } catch { return null }
  }

  const [draft, _setDraft] = useState<T>(() => {
    const saved = readSession()
    if (saved) {
      restored.current = true
      return saved
    }
    return defaultState
  })

  // Mark wasRestored after mount (avoid SSR mismatch)
  useEffect(() => {
    if (restored.current) setWasRestored(true)
  }, [])

  // Persist on every change
  useEffect(() => {
    if (options?.disabled) return
    try {
      sessionStorage.setItem(key, JSON.stringify({ ...draft, _savedAt: Date.now() }))
    } catch { /* ignore — quota exceeded or private browsing */ }
  }, [draft, key, options?.disabled])

  const setDraft = (update: Partial<T> | ((prev: T) => T)) => {
    _setDraft(prev =>
      typeof update === 'function' ? update(prev) : { ...prev, ...update }
    )
  }

  const clearDraft = () => {
    try { sessionStorage.removeItem(key) } catch (e) { console.warn('[non-fatal]', e) }
    _setDraft(defaultState)
    setWasRestored(false)
  }

  return { draft, setDraft, clearDraft, wasRestored }
}
