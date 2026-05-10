export type ContainerType = 'can' | 'bottle' | 'case' | 'cask' | 'glass' | 'unknown'

export function detectContainerType(productName: string): ContainerType {
  const n = productName.toLowerCase()
  if (/\b(case|carton|slab|24-?pack|6-?pack|24pk|6pk)\b/.test(n)) return 'case'
  if (/\bcask\b/.test(n)) return 'cask'
  if (/\b(can|stubbie|stubby|tinnie)\b/.test(n)) return 'can'
  if (/\b(bottle|btl|750ml|700ml|375ml|330ml)\b/.test(n)) return 'bottle'
  if (/\b(glass|nip)\b/.test(n)) return 'glass'
  return 'unknown'
}

export function detectCategory(productName: string, existing?: string): string {
  if (existing) return existing
  const n = productName.toLowerCase()
  if (/\b(beer|lager|ale|pilsner|stout|ipa|carlton|asahi|corona)\b/.test(n)) return 'beer'
  if (/\b(red|merlot|shiraz|cabernet|pinot noir)\b/.test(n)) return 'wine-red'
  if (/\b(wine|sav|chardonnay|riesling|pinot grigio|blanc)\b/.test(n)) return 'wine-white'
  if (/\b(whisky|whiskey|bourbon|scotch|jack daniel|glenfiddich|johnnie)\b/.test(n)) return 'whisky'
  if (/\b(vodka|gin|rum|tequila|spirit)\b/.test(n)) return 'spirits'
  if (/\b(liqueur|cointreau|baileys|kahlua|amaretto)\b/.test(n)) return 'liqueur'
  if (/\b(coffee|espresso|latte|cappuccino|flat white|mocha|chai)\b/.test(n)) return 'coffee'
  if (/\b(chips|crisps|nuts|pretzels|popcorn|biscuit|cookie|chocolate)\b/.test(n)) return 'snacks'
  if (/\b(soft drink|coke|sprite|pepsi|fanta|water|juice)\b/.test(n)) return 'mixer'
  return 'other'
}
