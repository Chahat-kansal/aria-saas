import { useEffect, useState } from 'react'

export const springs = {
  snappy: { type: 'spring', stiffness: 400, damping: 30 } as const,
  smooth: { type: 'spring', stiffness: 200, damping: 25 } as const,
  bounce: { type: 'spring', stiffness: 300, damping: 15 } as const,
  gentle: { type: 'spring', stiffness: 100, damping: 20 } as const,
}

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } },
}

export const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 200, damping: 25 } },
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}
