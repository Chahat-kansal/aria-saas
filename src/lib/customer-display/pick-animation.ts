/**
 * Picks the appropriate customer-display celebration animation
 * based on the cart's highest-value item.
 *
 * Sorting: items ranked by (price × quantity) descending.
 * The top-ranked item's category and name determine the animation type.
 */

type AnimationType =
  | 'beer-can'
  | 'wine-bottle'
  | 'snacks-spill'
  | 'coffee-steam'
  | 'cake-cut'
  | 'generic'

interface CartItem {
  product: { name: string; category?: string; container_type?: string }
  qty: number
  unitPrice: number
}

/** Returns the celebration animation best matching the top-value cart item. */
export function pickCelebrationAnimation(items: CartItem[]): AnimationType {
  if (!items || items.length === 0) return 'generic'

  // Sort by line value (price × qty) descending, pick the top
  const sorted = [...items].sort(
    (a, b) => b.unitPrice * b.qty - a.unitPrice * a.qty
  )
  const top = sorted[0]
  const name = (top.product.name ?? '').toLowerCase()
  const cat = (top.product.category ?? '').toLowerCase()
  const container = (top.product.container_type ?? '').toLowerCase()

  // Beer / canned drinks
  if (
    cat === 'beer' ||
    container === 'can' ||
    /\b(beer|lager|ale|pilsner|stout|ipa|carlton|asahi|corona|stubbie|tinnie)\b/.test(name)
  ) {
    return 'beer-can'
  }

  // Wine / spirits / bottles
  if (
    cat.startsWith('wine') ||
    cat === 'spirits' ||
    cat === 'whisky' ||
    cat === 'liqueur' ||
    container === 'bottle' ||
    container === 'cask' ||
    /\b(wine|merlot|shiraz|chardonnay|whisky|vodka|gin|rum|tequila|spirit|champagne|prosecco|cask)\b/.test(name)
  ) {
    return 'wine-bottle'
  }

  // Coffee / hot beverages
  if (
    cat === 'coffee' ||
    cat === 'tea' ||
    /\b(coffee|espresso|latte|cappuccino|flat white|mocha|chai|matcha|hot chocolate|piccolo|cortado)\b/.test(name)
  ) {
    return 'coffee-steam'
  }

  // Food / pastries / cake
  if (
    /\b(cake|torte|tart|birthday|celebration|dessert|brownie|muffin|slice|cupcake)\b/.test(name)
  ) {
    return 'cake-cut'
  }

  // Snacks / food
  if (
    cat === 'snacks' ||
    cat === 'food' ||
    /\b(chip|crisp|nut|pretzel|popcorn|biscuit|cookie|chocolate|lolly|lollies|candy|snack|roll|sandwich|burger|wrap|salad|pie|pastry|scone|croissant)\b/.test(name)
  ) {
    return 'snacks-spill'
  }

  return 'generic'
}
