'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { TerminalLayout } from '@/lib/terminal/layouts'

interface Props {
  layout: TerminalLayout
  children: React.ReactNode
}

export function LayoutWrapper({ layout, children }: Props) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={layout}
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.99 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
