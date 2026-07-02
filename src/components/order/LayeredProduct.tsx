'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { INGREDIENT_PATHS, BURGER_STACK_ORDER, type IngredientKey } from './ingredients'

const MAX_LAYERS = BURGER_STACK_ORDER.length

/**
 * How many px each ingredient raises the layer sitting above it.
 * Tuned so the resting burger reads as closed/assembled, not spaced cards.
 * Patty and bun-top carry the most visual mass; condiments are nearly flush.
 */
const LAYER_RISE: Record<IngredientKey, number> = {
  'bun-bottom': 20,
  'patty':      22,
  'cheese':      8,
  'bacon':      10,
  'tomato':     10,
  'lettuce':    12,
  'onion':       8,
  'pickle':      6,
  'sauce':       4,
  'bun-top':     0,
}

/** Total rise for a full stack at size=277 (277+100=377 container height) */
const MAX_RISE = (BURGER_STACK_ORDER as IngredientKey[]).reduce(
  (s, k) => s + LAYER_RISE[k],
  0,
)

const SPRING = { type: 'spring' as const, stiffness: 260, damping: 22, mass: 0.9 }

interface Props {
  layers: IngredientKey[]
  size?: number
}

export function LayeredProduct({ layers, size = 277 }: Props) {
  const scale = size / 277
  const containerH = size + Math.round(MAX_RISE * scale)
  const plateW = Math.round(size * 0.88)

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: containerH,
        flexShrink: 0,
      }}
    >
      {/* Soft plate surface — sits under bun-bottom at bottom baseline */}
      <div
        style={{
          position: 'absolute',
          bottom: -10,
          left: '50%',
          transform: 'translateX(-50%)',
          width: plateW,
          height: 26,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center top, #ffffff 30%, #ece8de 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.07)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <AnimatePresence>
        {layers.map((key, i) => {
          const bottom = Math.round(
            layers.slice(0, i).reduce((sum, k) => sum + LAYER_RISE[k], 0) * scale,
          )
          return (
            <motion.img
              key={key}
              src={INGREDIENT_PATHS[key]}
              alt={key}
              layout
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              transition={SPRING}
              style={{
                position: 'absolute',
                width: size,
                height: size,
                objectFit: 'contain',
                bottom,
                left: 0,
                pointerEvents: 'none',
                userSelect: 'none',
                zIndex: i + 1,
              }}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}