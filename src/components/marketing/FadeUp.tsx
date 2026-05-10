'use client'
import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

export function FadeUp({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.15 })

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 25,
        delay,
      }}
    >
      {children}
    </motion.div>
  )
}
