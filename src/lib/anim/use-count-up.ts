'use client'
// AN-D spell 12: number-counter — animate a numeric value from its previous value to the new one
// over a short duration on mount and on change. Pure display layer (does not mutate source state).
// Respects prefers-reduced-motion (returns the target value immediately).
import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, durationMs = 700): number {
  const [display, setDisplay] = useState<number>(target)
  const prevRef = useRef<number>(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') { setDisplay(target); return }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setDisplay(target); prevRef.current = target; return }

    const from = prevRef.current
    const to = target
    if (from === to) { setDisplay(to); return }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // easeOutCubic
      const e = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * e)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
  }, [target, durationMs])

  return display
}
