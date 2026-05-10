'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

export function CursorAura() {
  const [pos, setPos] = useState({ x: -1000, y: -1000 })
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    setIsMobile(window.innerWidth < 769)
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', handler, { passive: true })
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  if (isMobile) return null

  return (
    <motion.div
      animate={{ x: pos.x - 200, y: pos.y - 200 }}
      transition={{ type: 'spring', damping: 30, stiffness: 200 }}
      style={{
        position: 'fixed',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(127,184,151,0.10), transparent 60%)',
        pointerEvents: 'none',
        zIndex: 1,
        mixBlendMode: 'screen',
        top: 0,
        left: 0,
      }}
    />
  )
}
