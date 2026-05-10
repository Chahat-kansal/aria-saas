import { ProductForTerminal } from '@/components/terminal/layouts/types'

interface Context {
  products: ProductForTerminal[]
  recentProductIds: string[]
  cartProductIds: string[]
  nowAEST: Date
}

/**
 * Local heuristic suggestions — no API call. Fast and deterministic.
 * Scores by time-of-day, day-of-week, recent sales, cart cross-sell.
 */
export function getAriaSuggestions(ctx: Context): string[] {
  const { products, recentProductIds, cartProductIds, nowAEST } = ctx
  const hour = nowAEST.getHours()
  const day = nowAEST.getDay() // 0=Sun, 5=Fri

  const cartCategories = new Set(
    cartProductIds
      .map(id => products.find(p => p.id === id)?.category?.toLowerCase())
      .filter(Boolean) as string[]
  )

  const scored = products
    .filter(p => p.active !== false)
    .filter(p => !p.track_inventory || (p.stock_quantity ?? 1) > 0)
    .map(p => {
      let score = 0
      const cat = (p.category ?? '').toLowerCase()
      const name = p.name.toLowerCase()

      // Time-of-day
      if (hour < 11) {
        if (cat === 'coffee' || /coffee|latte|espresso|chai|matcha/.test(name)) score += 30
        if (/croissant|muffin|toast|bacon|egg|granola/.test(name)) score += 25
      } else if (hour < 14) {
        if (/sandwich|burger|salad|wrap|quiche|pie/.test(name)) score += 30
        if (cat === 'coffee') score += 15
      } else if (hour < 17) {
        if (/cake|slice|cookie|brownie|scone/.test(name)) score += 25
        if (cat === 'coffee') score += 20
      } else {
        if (cat === 'beer' || cat === 'beer & cider') score += 30
        if (cat.startsWith('wine')) score += 25
        if (cat === 'snacks') score += 20
      }

      // Friday beer/wine boost
      if (day === 5 && (cat === 'beer' || cat === 'beer & cider' || cat.startsWith('wine'))) {
        score += 15
      }

      // Boost recently purchased items (proven sellers today)
      const recentIdx = recentProductIds.indexOf(p.id)
      if (recentIdx >= 0) score += Math.max(0, 20 - recentIdx * 3)

      // Cart cross-sell
      if ((cartCategories.has('beer') || cartCategories.has('beer & cider')) &&
          (cat === 'snacks' || /chip|nut|pretzel/.test(name))) score += 25
      if (cartCategories.has('coffee') && /croissant|muffin|cookie/.test(name)) score += 25
      if ((cartCategories.has('wine-red') || cartCategories.has('wine-white') || cartCategories.has('wine')) &&
          /cheese|cracker|olive/.test(name)) score += 25

      return { product: p, score }
    })
    .sort((a, b) => b.score - a.score)

  // Pick top items with category diversity (max 2 per category)
  const catCount: Record<string, number> = {}
  const picked: string[] = []

  for (const { product } of scored) {
    const cat = (product.category ?? 'other').toLowerCase()
    const count = catCount[cat] ?? 0
    if (count >= 2) continue
    catCount[cat] = count + 1
    picked.push(product.id)
    if (picked.length >= 6) break
  }

  return picked.slice(0, 4)
}
