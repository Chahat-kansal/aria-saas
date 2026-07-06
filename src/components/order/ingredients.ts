import manifest from '../../../public/menu/assets-manifest.json'

export type IngredientKey =
  // Burger
  | 'bun-bottom' | 'patty' | 'patty-chicken' | 'patty-veg'
  | 'cheese' | 'bacon' | 'tomato' | 'lettuce' | 'onion' | 'pickle' | 'sauce' | 'bun-top'
  // Brekky bowl
  | 'brekky-acai' | 'brekky-banana' | 'brekky-bircher' | 'brekky-chia-seeds'
  | 'brekky-granola' | 'brekky-honey' | 'brekky-mixed-berries' | 'brekky-strawberries' | 'brekky-yoghurt'
  // Cooked breakfast
  | 'ckd-bacon' | 'ckd-baked-beans' | 'ckd-fried-eggs' | 'ckd-grilled-tomato'
  | 'ckd-hash-brown' | 'ckd-mushrooms' | 'ckd-poached-egg' | 'ckd-sausage' | 'ckd-toast'
  // Salad / bowl
  | 'salad-caesar-dressing' | 'salad-cherry-tomatoes' | 'salad-chicken' | 'salad-croutons'
  | 'salad-cucumber' | 'salad-feta' | 'salad-lettuce' | 'salad-olives' | 'salad-parmesan'
  // Toastie
  | 'tst-avocado' | 'tst-baby-spinach' | 'tst-cheese' | 'tst-egg' | 'tst-ham'
  | 'tst-mushrooms' | 'tst-spinach' | 'tst-toast' | 'tst-tomato'
  // Wrap
  | 'wrap-chicken' | 'wrap-falafel' | 'wrap-hummus' | 'wrap-red-onion'
  | 'wrap-shredded-lettuce' | 'wrap-tomato' | 'wrap-tzatziki' | 'wrap-wrap'

export const INGREDIENT_PATHS: Record<IngredientKey, string> =
  manifest.ingredients as Record<IngredientKey, string>

// Three proteins sit in the same vertical slot; only the selected one renders.
export const ALL_PROTEINS: ReadonlyArray<IngredientKey> = ['patty', 'patty-chicken', 'patty-veg']

// Optional toppings shown in the drag/tap tray (burger mode).
export const OPTIONAL_TOPPINGS: IngredientKey[] = [
  'cheese', 'bacon', 'tomato', 'lettuce', 'onion', 'pickle', 'sauce',
]

// Complete render order — protein alternatives share the same slot.
export const BURGER_STACK_ORDER: IngredientKey[] = [
  'bun-bottom',
  'patty', 'patty-chicken', 'patty-veg',
  'cheese', 'bacon', 'tomato', 'lettuce', 'onion', 'pickle', 'sauce',
  'bun-top',
]

/**
 * Build the ordered visual layer array from customiser state.
 * Only one protein renders; defaults not removed stay in; extras repeat qty times.
 */
export function composeBurger(opts: {
  protein?: IngredientKey
  defaults?: IngredientKey[]
  removed?: ReadonlySet<IngredientKey>
  extras?: Readonly<Partial<Record<IngredientKey, number>>>
}): IngredientKey[] {
  const {
    protein = 'patty',
    defaults = [],
    removed = new Set<IngredientKey>(),
    extras = {},
  } = opts

  const defaultSet = new Set(defaults)
  const result: IngredientKey[] = []

  for (const key of BURGER_STACK_ORDER) {
    if ((ALL_PROTEINS as readonly string[]).includes(key)) {
      if (key === protein) result.push(key)
    } else if (key === 'bun-bottom' || key === 'bun-top') {
      result.push(key)
    } else {
      if (defaultSet.has(key) && !removed.has(key)) result.push(key)
      const qty = extras[key] ?? 0
      for (let i = 0; i < qty; i++) result.push(key)
    }
  }

  return result
}

// ── Food build libraries ──────────────────────────────────────────────────────

export interface FoodLibrary {
  items: IngredientKey[]    // full tray catalog (base excluded from tray display)
  base: IngredientKey       // always-present base layer (shown first in visual)
  defaults: IngredientKey[] // pre-selected toppings
  layout: 'stack' | 'bowl' | 'scatter'
}

// Brekky bowl — nested bowl layout
export const BREKKY_BOWL_ITEMS: IngredientKey[] = [
  'brekky-granola', 'brekky-mixed-berries', 'brekky-strawberries', 'brekky-banana',
  'brekky-acai', 'brekky-bircher', 'brekky-chia-seeds', 'brekky-honey',
]
export const BREKKY_BOWL_BASE: IngredientKey = 'brekky-yoghurt'
export const BREKKY_BOWL_DEFAULTS: IngredientKey[] = ['brekky-granola', 'brekky-mixed-berries']

// Cooked breakfast — scatter layout
export const COOKED_BREAKFAST_ITEMS: IngredientKey[] = [
  'ckd-bacon', 'ckd-poached-egg', 'ckd-fried-eggs', 'ckd-sausage',
  'ckd-baked-beans', 'ckd-grilled-tomato', 'ckd-hash-brown', 'ckd-mushrooms',
]
export const COOKED_BREAKFAST_BASE: IngredientKey = 'ckd-toast'
export const COOKED_BREAKFAST_DEFAULTS: IngredientKey[] = ['ckd-bacon', 'ckd-poached-egg']

// Salad / caesar bowl — nested bowl layout
export const SALAD_ITEMS: IngredientKey[] = [
  'salad-chicken', 'salad-cherry-tomatoes', 'salad-croutons', 'salad-cucumber',
  'salad-feta', 'salad-caesar-dressing', 'salad-olives', 'salad-parmesan',
]
export const SALAD_BASE: IngredientKey = 'salad-lettuce'
export const SALAD_DEFAULTS: IngredientKey[] = ['salad-chicken', 'salad-cherry-tomatoes', 'salad-croutons']

// Toastie / sandwich — stack layout
export const TOASTIE_ITEMS: IngredientKey[] = [
  'tst-ham', 'tst-cheese', 'tst-tomato', 'tst-egg',
  'tst-avocado', 'tst-baby-spinach', 'tst-spinach', 'tst-mushrooms',
]
export const TOASTIE_BASE: IngredientKey = 'tst-toast'
export const TOASTIE_DEFAULTS: IngredientKey[] = ['tst-ham', 'tst-cheese']

// Wrap / roll — stack layout
export const WRAP_ITEMS: IngredientKey[] = [
  'wrap-chicken', 'wrap-falafel', 'wrap-tomato', 'wrap-shredded-lettuce',
  'wrap-red-onion', 'wrap-hummus', 'wrap-tzatziki',
]
export const WRAP_BASE: IngredientKey = 'wrap-wrap'
export const WRAP_DEFAULTS: IngredientKey[] = ['wrap-chicken', 'wrap-tomato', 'wrap-shredded-lettuce']

export const FOOD_LIBRARIES: Record<string, FoodLibrary> = {
  bowl:      { items: BREKKY_BOWL_ITEMS,      base: BREKKY_BOWL_BASE,      defaults: BREKKY_BOWL_DEFAULTS,      layout: 'bowl' },
  brekky:    { items: BREKKY_BOWL_ITEMS,      base: BREKKY_BOWL_BASE,      defaults: BREKKY_BOWL_DEFAULTS,      layout: 'bowl' },
  salad:     { items: SALAD_ITEMS,            base: SALAD_BASE,            defaults: SALAD_DEFAULTS,            layout: 'bowl' },
  toastie:   { items: TOASTIE_ITEMS,          base: TOASTIE_BASE,          defaults: TOASTIE_DEFAULTS,          layout: 'stack' },
  sandwich:  { items: TOASTIE_ITEMS,          base: TOASTIE_BASE,          defaults: TOASTIE_DEFAULTS,          layout: 'stack' },
  roll:      { items: WRAP_ITEMS,             base: WRAP_BASE,             defaults: WRAP_DEFAULTS,             layout: 'stack' },
  wrap:      { items: WRAP_ITEMS,             base: WRAP_BASE,             defaults: WRAP_DEFAULTS,             layout: 'stack' },
  breakfast: { items: COOKED_BREAKFAST_ITEMS, base: COOKED_BREAKFAST_BASE, defaults: COOKED_BREAKFAST_DEFAULTS, layout: 'scatter' },
}

// Compose food layers: base always first, then active toppings
export function composeFoodLayers(base: IngredientKey, active: IngredientKey[]): IngredientKey[] {
  return [base, ...active.filter(k => k !== base)]
}

// Match a modifier option name to an ingredient key within a given library
const KEY_PATTERNS: Partial<Record<IngredientKey, string[]>> = {
  'brekky-acai':         ['acai', 'àçaï'],
  'brekky-banana':       ['banana'],
  'brekky-bircher':      ['bircher'],
  'brekky-chia-seeds':   ['chia'],
  'brekky-granola':      ['granola'],
  'brekky-honey':        ['honey'],
  'brekky-mixed-berries':['mixed berr', 'berr'],
  'brekky-strawberries': ['strawberr'],
  'brekky-yoghurt':      ['yogh', 'yogurt'],
  'ckd-bacon':           ['bacon'],
  'ckd-baked-beans':     ['baked bean', 'beans'],
  'ckd-fried-eggs':      ['fried egg'],
  'ckd-grilled-tomato':  ['grilled tomato'],
  'ckd-hash-brown':      ['hash brown', 'hashbrown'],
  'ckd-mushrooms':       ['mushroom'],
  'ckd-poached-egg':     ['poached egg', 'poached'],
  'ckd-sausage':         ['sausage'],
  'ckd-toast':           ['toast'],
  'salad-caesar-dressing':['caesar', 'dressing'],
  'salad-cherry-tomatoes':['cherry tomato', 'cherry tom'],
  'salad-chicken':       ['chicken'],
  'salad-croutons':      ['crouton'],
  'salad-cucumber':      ['cucumber'],
  'salad-feta':          ['feta'],
  'salad-lettuce':       ['lettuce', 'romaine'],
  'salad-olives':        ['olive'],
  'salad-parmesan':      ['parmesan', 'parm'],
  'tst-avocado':         ['avocado', ' avo'],
  'tst-baby-spinach':    ['baby spinach'],
  'tst-cheese':          ['cheese'],
  'tst-egg':             ['egg'],
  'tst-ham':             ['ham'],
  'tst-mushrooms':       ['mushroom'],
  'tst-spinach':         ['spinach'],
  'tst-toast':           ['toast', 'bread', 'sourdough'],
  'tst-tomato':          ['tomato'],
  'wrap-chicken':        ['chicken'],
  'wrap-falafel':        ['falafel'],
  'wrap-hummus':         ['hummus'],
  'wrap-red-onion':      ['red onion'],
  'wrap-shredded-lettuce':['shredded lettuce', 'lettuce'],
  'wrap-tomato':         ['tomato'],
  'wrap-tzatziki':       ['tzatziki'],
  'wrap-wrap':           ['wrap', 'tortilla', 'flatbread'],
}

export function nameToFoodKey(name: string, library: IngredientKey[]): IngredientKey | null {
  const low = name.toLowerCase()
  for (const key of library) {
    const patterns = KEY_PATTERNS[key]
    if (!patterns) continue
    for (const p of patterns) {
      if (low.includes(p)) return key
    }
  }
  return null
}