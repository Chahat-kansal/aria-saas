// ── Drink → 3D vessel fill mapping ───────────────────────────────────────────
// Each entry describes which GLB vessel to load and how to fill it visually.
// Modifier logic (milk lightening, syrup tinting) is applied by resolveVessel().
//
// TODO ORD-3D-COFFEE-WIRE: wire these to real pos_products rows by drink_category.

export type VesselKey =
  | 'cup-hot-dinein'
  | 'cup-hot-takeaway'
  | 'glass-iced-dinein'
  | 'cup-iced-takeaway'
  | 'smoothie'

export type VesselFamily = 'hot' | 'iced' | 'smoothie'

export type OrderType = 'dine-in' | 'takeaway'

export type DrinkType =
  | 'flat-white'
  | 'latte'
  | 'cappuccino'
  | 'mocha'
  | 'long-black'
  | 'hot-choc'
  | 'chai'
  | 'matcha'
  | 'iced-coffee'
  | 'iced-latte'
  | 'iced-choc'
  | 'juice-orange'
  | 'juice-apple'
  | 'smoothie-berry'
  | 'smoothie-mango'

export interface DrinkFill {
  baseVesselDineIn: VesselKey
  baseVesselTakeaway: VesselKey
  fillColor: string   // hex, no alpha
  fillLevel: number   // 0..1 (how full the vessel is)
  foam: boolean
  ice: boolean
}

export const DRINK_FILLS: Record<DrinkType, DrinkFill> = {
  'flat-white':   { baseVesselDineIn: 'cup-hot-dinein',  baseVesselTakeaway: 'cup-hot-takeaway',  fillColor: '#8B5A3C', fillLevel: 0.82, foam: false, ice: false },
  'latte':        { baseVesselDineIn: 'cup-hot-dinein',  baseVesselTakeaway: 'cup-hot-takeaway',  fillColor: '#A0714F', fillLevel: 0.85, foam: false, ice: false },
  'cappuccino':   { baseVesselDineIn: 'cup-hot-dinein',  baseVesselTakeaway: 'cup-hot-takeaway',  fillColor: '#6B3F2A', fillLevel: 0.75, foam: true,  ice: false },
  'mocha':        { baseVesselDineIn: 'cup-hot-dinein',  baseVesselTakeaway: 'cup-hot-takeaway',  fillColor: '#4A2C1A', fillLevel: 0.82, foam: true,  ice: false },
  'long-black':   { baseVesselDineIn: 'cup-hot-dinein',  baseVesselTakeaway: 'cup-hot-takeaway',  fillColor: '#1C1008', fillLevel: 0.70, foam: false, ice: false },
  'hot-choc':     { baseVesselDineIn: 'cup-hot-dinein',  baseVesselTakeaway: 'cup-hot-takeaway',  fillColor: '#3E1F0D', fillLevel: 0.85, foam: true,  ice: false },
  'chai':         { baseVesselDineIn: 'cup-hot-dinein',  baseVesselTakeaway: 'cup-hot-takeaway',  fillColor: '#C4733A', fillLevel: 0.82, foam: false, ice: false },
  'matcha':       { baseVesselDineIn: 'cup-hot-dinein',  baseVesselTakeaway: 'cup-hot-takeaway',  fillColor: '#5D7A3C', fillLevel: 0.82, foam: false, ice: false },
  'iced-coffee':  { baseVesselDineIn: 'glass-iced-dinein', baseVesselTakeaway: 'cup-iced-takeaway', fillColor: '#7A4E30', fillLevel: 0.78, foam: false, ice: true  },
  'iced-latte':   { baseVesselDineIn: 'glass-iced-dinein', baseVesselTakeaway: 'cup-iced-takeaway', fillColor: '#A07850', fillLevel: 0.80, foam: false, ice: true  },
  'iced-choc':    { baseVesselDineIn: 'glass-iced-dinein', baseVesselTakeaway: 'cup-iced-takeaway', fillColor: '#3A1A0A', fillLevel: 0.80, foam: false, ice: true  },
  'juice-orange': { baseVesselDineIn: 'glass-iced-dinein', baseVesselTakeaway: 'cup-iced-takeaway', fillColor: '#E8720C', fillLevel: 0.82, foam: false, ice: true  },
  'juice-apple':  { baseVesselDineIn: 'glass-iced-dinein', baseVesselTakeaway: 'cup-iced-takeaway', fillColor: '#B5C940', fillLevel: 0.82, foam: false, ice: false },
  'smoothie-berry': { baseVesselDineIn: 'smoothie', baseVesselTakeaway: 'smoothie', fillColor: '#7B2D8B', fillLevel: 0.88, foam: false, ice: false },
  'smoothie-mango': { baseVesselDineIn: 'smoothie', baseVesselTakeaway: 'smoothie', fillColor: '#F0A030', fillLevel: 0.88, foam: false, ice: false },
}

export interface ResolvedVessel {
  modelPath: string
  fillColor: string
  fillLevel: number
  foam: boolean
  ice: boolean
  vesselFamily: VesselFamily
  isTransparent: boolean
}

// Maps ordering_archetype → spin folder under /menu/_lib/spin/<slug>/
// Returns null when no spin set → ProductView falls through to hero image
export function resolveCoffeeSpin(archetype: string): string | null {
  switch (archetype) {
    case 'flat-white': case 'latte': case 'cappuccino': case 'mocha':
    case 'chai': case 'dirty-chai': case 'matcha': case 'turmeric-latte':
    case 'macchiato': case 'long-macchiato': case 'long-black':
      return 'flat-white'
    case 'espresso':
      return 'espresso'
    case 'iced-latte': case 'iced-mocha': case 'iced-choc': case 'iced-coffee':
      return 'iced-latte'
    case 'hot-choc':
      return 'hot-choc'
    case 'chai-tea':
      return 'chai-tea'
    case 'cold-brew':
      return 'cold-brew'
    case 'choc-milkshake': case 'caramel-milkshake': case 'vanilla-milkshake':
      return 'milkshake'
    case 'acai': case 'avocado': case 'banana': case 'berry':
    case 'choc-smoothie': case 'green-smoothie': case 'mango-smoothie':
    case 'smoothie-berry': case 'smoothie-mango':
      return 'smoothie'
    case 'juice-apple': case 'juice-orange':
      return 'juice'
    default:
      return null
  }
}

// Slugs rendered on baked grey bg (#c8c8c4) — no rembg applied, glass visible
const GREY_BG_SLUGS = new Set(['iced-latte', 'cold-brew', 'milkshake', 'juice', 'smoothie', 'chai-tea'])

export function resolveCoffeeBgMode(slug: string): 'transparent' | 'grey' {
  return GREY_BG_SLUGS.has(slug) ? 'grey' : 'transparent'
}

// Modifiers that lighten the fill color (milk, oat milk)
const MILK_LIGHTENING = 0.28  // fraction toward white

function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lr = Math.round(r + (255 - r) * amount)
  const lg = Math.round(g + (255 - g) * amount)
  const lb = Math.round(b + (255 - b) * amount)
  return '#' + lr.toString(16).padStart(2, '0') + lg.toString(16).padStart(2, '0') + lb.toString(16).padStart(2, '0')
}

function blendHex(base: string, tint: string, amount: number): string {
  const br = parseInt(base.slice(1, 3), 16), bg = parseInt(base.slice(3, 5), 16), bb = parseInt(base.slice(5, 7), 16)
  const tr = parseInt(tint.slice(1, 3), 16), tg = parseInt(tint.slice(3, 5), 16), tb = parseInt(tint.slice(5, 7), 16)
  const nr = Math.round(br + (tr - br) * amount)
  const ng = Math.round(bg + (tg - bg) * amount)
  const nb = Math.round(bb + (tb - bb) * amount)
  return '#' + nr.toString(16).padStart(2, '0') + ng.toString(16).padStart(2, '0') + nb.toString(16).padStart(2, '0')
}

const VESSEL_PATH: Record<VesselKey, string> = {
  'cup-hot-dinein':    '/menu/_lib/models/cup-hot-dinein.glb',
  'cup-hot-takeaway':  '/menu/_lib/models/cup-hot-takeaway.glb',
  'glass-iced-dinein': '/menu/_lib/models/glass-iced-dinein.glb',
  'cup-iced-takeaway': '/menu/_lib/models/cup-iced-takeaway.glb',
  'smoothie':          '/menu/_lib/models/smoothie.glb',
}

const VESSEL_FAMILY: Record<VesselKey, VesselFamily> = {
  'cup-hot-dinein':    'hot',
  'cup-hot-takeaway':  'hot',
  'glass-iced-dinein': 'iced',
  'cup-iced-takeaway': 'iced',
  'smoothie':          'smoothie',
}

// true = render liquid as a column inside clear glass walls
// false = render liquid as a top disc only (ceramic/paper cup — walls are opaque)
const VESSEL_TRANSPARENT: Record<VesselKey, boolean> = {
  'cup-hot-dinein':    false,
  'cup-hot-takeaway':  false,
  'glass-iced-dinein': true,
  'cup-iced-takeaway': false,
  'smoothie':          true,
}

export interface ModifierFlags {
  milk?: boolean      // dairy/oat/soy — lightens fill
  extraMilk?: boolean // double-lightens
  caramelSyrup?: boolean
  vanillaSyrup?: boolean
  hazelnutSyrup?: boolean
}

export function resolveVessel(
  drink: DrinkType,
  orderType: OrderType,
  mods?: ModifierFlags,
): ResolvedVessel {
  const def = DRINK_FILLS[drink]
  const vesselKey = orderType === 'dine-in' ? def.baseVesselDineIn : def.baseVesselTakeaway
  let color = def.fillColor

  if (mods?.extraMilk) color = lightenHex(color, MILK_LIGHTENING * 2)
  else if (mods?.milk)  color = lightenHex(color, MILK_LIGHTENING)

  if (mods?.caramelSyrup)  color = blendHex(color, '#C88020', 0.18)
  if (mods?.vanillaSyrup)  color = blendHex(color, '#F5E6C8', 0.12)
  if (mods?.hazelnutSyrup) color = blendHex(color, '#8B5020', 0.15)

  return {
    modelPath:     VESSEL_PATH[vesselKey],
    fillColor:     color,
    fillLevel:     def.fillLevel,
    foam:          def.foam,
    ice:           def.ice,
    vesselFamily:  VESSEL_FAMILY[vesselKey],
    isTransparent: VESSEL_TRANSPARENT[vesselKey],
  }
}

export const DRINK_LABELS: Record<DrinkType, string> = {
  'flat-white':     'Flat White',
  'latte':          'Latte',
  'cappuccino':     'Cappuccino',
  'mocha':          'Mocha',
  'long-black':     'Long Black',
  'hot-choc':       'Hot Chocolate',
  'chai':           'Chai Latte',
  'matcha':         'Matcha Latte',
  'iced-coffee':    'Iced Coffee',
  'iced-latte':     'Iced Latte',
  'iced-choc':      'Iced Chocolate',
  'juice-orange':   'Orange Juice',
  'juice-apple':    'Apple Juice',
  'smoothie-berry': 'Berry Smoothie',
  'smoothie-mango': 'Mango Smoothie',
}