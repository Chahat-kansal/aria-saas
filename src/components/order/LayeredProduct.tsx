'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { INGREDIENT_PATHS, type IngredientKey } from './ingredients'

const LAYER_RISE: Record<IngredientKey, number> = {
  // Burger
  'bun-bottom':    20,
  'patty':         22,
  'patty-chicken': 22,
  'patty-veg':     20,
  'cheese':         8,
  'bacon':         10,
  'tomato':        10,
  'lettuce':       12,
  'onion':          8,
  'pickle':         6,
  'sauce':          4,
  'bun-top':        0,
  // Brekky bowl (bowl layout — rise values unused, set to 8)
  'brekky-acai':          8,
  'brekky-banana':        8,
  'brekky-bircher':       8,
  'brekky-chia-seeds':    8,
  'brekky-granola':       8,
  'brekky-honey':         8,
  'brekky-mixed-berries': 8,
  'brekky-strawberries':  8,
  'brekky-yoghurt':       8,
  // Cooked breakfast (scatter layout — rise values unused, set to 8)
  'ckd-bacon':         8,
  'ckd-baked-beans':   8,
  'ckd-fried-eggs':    8,
  'ckd-grilled-tomato':8,
  'ckd-hash-brown':    8,
  'ckd-mushrooms':     8,
  'ckd-poached-egg':   8,
  'ckd-sausage':       8,
  'ckd-toast':         8,
  // Salad (bowl layout — rise values unused, set to 8)
  'salad-caesar-dressing':  8,
  'salad-cherry-tomatoes':  8,
  'salad-chicken':          8,
  'salad-croutons':         8,
  'salad-cucumber':         8,
  'salad-feta':             8,
  'salad-lettuce':          8,
  'salad-olives':           8,
  'salad-parmesan':         8,
  // Toastie (stack layout — actual rise values for visual stacking)
  'tst-toast':        18,
  'tst-ham':          10,
  'tst-cheese':        8,
  'tst-tomato':       10,
  'tst-egg':          12,
  'tst-avocado':      10,
  'tst-baby-spinach':  8,
  'tst-spinach':       8,
  'tst-mushrooms':    10,
  // Wrap (stack layout — actual rise values)
  'wrap-wrap':           18,
  'wrap-chicken':        10,
  'wrap-falafel':        12,
  'wrap-hummus':          6,
  'wrap-red-onion':       8,
  'wrap-shredded-lettuce':8,
  'wrap-tomato':          8,
  'wrap-tzatziki':        6,
}

const SPRING = { type: 'spring' as const, stiffness: 260, damping: 22, mass: 0.9 }

interface Props {
  layers: IngredientKey[]
  size?: number
  layout?: 'stack' | 'bowl' | 'scatter'
}

export function LayeredProduct({ layers, size = 277, layout = 'stack' }: Props) {
  const scale = size / 277

  // stack: classic burger rise; bowl: layers nest toward center; scatter: pizza/toastie spread
  if (layout === 'stack') {
    const maxRise = Object.values(LAYER_RISE).reduce((s, v) => s + v, 0)
    const containerH = size + Math.round(maxRise * scale)
    const plateW = Math.round(size * 0.88)

    return (
      <div style={{ position: 'relative', width: size, height: containerH, flexShrink: 0 }}>
        {/* Plate shadow */}
        <div style={{
          position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
          width: plateW, height: 26, borderRadius: '50%',
          background: 'radial-gradient(ellipse at center top, #ffffff 30%, #ece8de 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.07)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <AnimatePresence>
          {layers.map((key, i) => {
            const bottom = Math.round(
              layers.slice(0, i).reduce((sum, k) => sum + LAYER_RISE[k], 0) * scale,
            )
            return (
              <motion.img
                key={key + '-' + i}
                src={INGREDIENT_PATHS[key]}
                alt={key}
                layout
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -30, opacity: 0 }}
                transition={SPRING}
                style={{
                  position: 'absolute', width: size, height: size,
                  objectFit: 'contain', bottom, left: 0,
                  pointerEvents: 'none', userSelect: 'none', zIndex: i + 1,
                }}
              />
            )
          })}
        </AnimatePresence>
      </div>
    )
  }

  if (layout === 'bowl') {
    // Layers nest toward center of a bowl vessel
    const containerH = size + Math.round(40 * scale)
    return (
      <div style={{ position: 'relative', width: size, height: containerH, flexShrink: 0 }}>
        {/* Bowl outline */}
        <div style={{
          position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: Math.round(size * 0.9), height: Math.round(size * 0.5),
          borderRadius: '0 0 50% 50%', border: '3px solid rgba(0,0,0,0.08)',
          background: 'radial-gradient(ellipse at bottom, #f5f0e8 60%, #e8e0d0 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <AnimatePresence>
          {layers.map((key, i) => {
            const xOffset = Math.round(((i % 3) - 1) * size * 0.12)
            const yOffset = Math.round(Math.floor(i / 3) * size * 0.08)
            return (
              <motion.img
                key={key + '-' + i}
                src={INGREDIENT_PATHS[key]}
                alt={key}
                layout
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 0.55, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={SPRING}
                style={{
                  position: 'absolute',
                  width: size, height: size,
                  objectFit: 'contain',
                  bottom: Math.round(size * 0.05) - yOffset,
                  left: xOffset,
                  pointerEvents: 'none', userSelect: 'none', zIndex: i + 1,
                }}
              />
            )
          })}
        </AnimatePresence>
      </div>
    )
  }

  // scatter: toppings distribute across base (pizza / toastie enabler)
  const containerH = size
  return (
    <div style={{ position: 'relative', width: size, height: containerH, flexShrink: 0 }}>
      {/* Base layer always fills the canvas */}
      {layers[0] && (
        <img
          src={INGREDIENT_PATHS[layers[0]]}
          alt={layers[0]}
          style={{ position: 'absolute', width: size, height: size, objectFit: 'contain', zIndex: 1 }}
        />
      )}
      <AnimatePresence>
        {layers.slice(1).map((key, i) => {
          const angle = (i / Math.max(layers.length - 1, 1)) * 360
          const r = size * 0.22
          const x = Math.round(r * Math.cos((angle * Math.PI) / 180))
          const y = Math.round(r * Math.sin((angle * Math.PI) / 180))
          return (
            <motion.img
              key={key + '-' + i}
              src={INGREDIENT_PATHS[key]}
              alt={key}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 0.45, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={SPRING}
              style={{
                position: 'absolute',
                width: size, height: size,
                objectFit: 'contain',
                top: '50%', left: '50%',
                transform: 'translate(calc(-50% + ' + x + 'px), calc(-50% + ' + y + 'px)) scale(0.45)',
                pointerEvents: 'none', userSelect: 'none', zIndex: i + 2,
              }}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}