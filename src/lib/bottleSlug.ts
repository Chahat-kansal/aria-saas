export type BottleSlug = 'wine' | 'beer' | 'can' | 'spirits-a' | 'spirits-b'

const BOTTLE_MAP: Record<string, BottleSlug> = {
  wine: 'wine',          'red-wine': 'wine',    'white-wine': 'wine',
  rose: 'wine',          'rosé': 'wine',         champagne: 'wine',
  prosecco: 'wine',      sparkling: 'wine',      port: 'wine',
  beer: 'beer',          lager: 'beer',           ale: 'beer',
  stout: 'beer',         cider: 'beer',           porter: 'beer',
  pilsner: 'beer',       ipa: 'beer',             'pale-ale': 'beer',
  can: 'can',            rtd: 'can',              seltzer: 'can',
  'hard-seltzer': 'can', 'pre-mix': 'can',        cooler: 'can',
  'spirits-a': 'spirits-a', spirits: 'spirits-a',
  whiskey: 'spirits-a',  whisky: 'spirits-a',
  gin: 'spirits-a',      vodka: 'spirits-a',
  rum: 'spirits-a',      bourbon: 'spirits-a',
  tequila: 'spirits-a',  mezcal: 'spirits-a',
  scotch: 'spirits-a',   brandy: 'spirits-a',
  'spirits-b': 'spirits-b', liqueur: 'spirits-b',
  sake: 'spirits-b',     vermouth: 'spirits-b',
  aperitif: 'spirits-b', amaro: 'spirits-b',
  digestif: 'spirits-b', cordial: 'spirits-b',
}

export function resolveBottleSlug(archetype: string | null | undefined): BottleSlug | null {
  if (!archetype) return null
  const key = archetype.toLowerCase().trim().replace(/[\s_]+/g, '-')
  return BOTTLE_MAP[key] ?? null
}