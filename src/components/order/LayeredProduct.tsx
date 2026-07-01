'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { INGREDIENT_PATHS, BURGER_STACK_ORDER, type IngredientKey } from './ingredients'

const MAX_LAYERS = BURGER_STACK_ORDER.length

interface Props {
  layers: IngredientKey[]
  size?: number
  baseOffset?: number
}

const SPRING = { type: 'spring' as const, stiffness: 260, damping: 22, mass: 0.9 }

export function LayeredProduct({ layers, size = 277, baseOffset = 28 }: Props) {
  const containerH = size + (MAX_LAYERS - 1) * baseOffset

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: containerH,
        flexShrink: 0,
      }}
    >
      <AnimatePresence>
        {layers.map((key, i) => (
          <motion.img
            key={key}
            src={INGREDIENT_PATHS[key]}
            alt={key}
            layout
            initial={{ y: -28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={SPRING}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              objectFit: 'contain',
              bottom: i * baseOffset,
              left: 0,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}