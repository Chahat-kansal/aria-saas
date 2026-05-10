export type TerminalLayout =
  | 'grid'
  | 'shelf'
  | 'carousel'
  | 'masonry'
  | 'search-first'

export interface LayoutConfig {
  id: TerminalLayout
  label: string
  icon: string
  description: string
  bestFor: string
  speed: string
}

export const LAYOUTS: Record<TerminalLayout, LayoutConfig> = {
  grid: {
    id: 'grid',
    label: 'Fast Grid',
    icon: '▦',
    description: 'Dense 4-column grid. Fastest scan time.',
    bestFor: 'Liquor · Convenience · Pharmacy',
    speed: '~200-400ms',
  },
  shelf: {
    id: 'shelf',
    label: 'Shelf',
    icon: '▤',
    description: 'Horizontal rows by category, like a real shelf.',
    bestFor: 'Boutique liquor · Wine merchants',
    speed: '~600ms (better recall)',
  },
  carousel: {
    id: 'carousel',
    label: 'Carousel',
    icon: '▭',
    description: 'Netflix-style horizontal scroll per category.',
    bestFor: 'Wine-focused · Specialty stores',
    speed: '~500ms with category nav',
  },
  masonry: {
    id: 'masonry',
    label: 'Masonry',
    icon: '▢',
    description: 'Pinterest-style variable height. Hero items larger.',
    bestFor: 'Marketing displays · Customer menus',
    speed: '~700ms (visual, slower scan)',
  },
  'search-first': {
    id: 'search-first',
    label: 'Search-First',
    icon: '⌕',
    description: 'Big search + Aria suggestions + recent items.',
    bestFor: 'Cafe · Fast food · High-volume convenience',
    speed: '<100ms with autocomplete',
  },
}

export function defaultLayoutForBusiness(business_type: string): TerminalLayout {
  switch (business_type) {
    case 'liquor': return 'grid'
    case 'convenience': return 'grid'
    case 'bakery': return 'shelf'
    case 'cafe': return 'search-first'
    case 'restaurant': return 'search-first'
    case 'other': return 'grid'
    default: return 'grid'
  }
}

const STORAGE_KEY = 'aria-terminal-layout'

export function getCurrentLayout(
  business_type: string,
  db_override: TerminalLayout | null
): TerminalLayout {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && stored in LAYOUTS) {
      return stored as TerminalLayout
    }
  }
  if (db_override) return db_override
  return defaultLayoutForBusiness(business_type)
}

export function setCurrentLayout(layout: TerminalLayout) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, layout)
  }
}
