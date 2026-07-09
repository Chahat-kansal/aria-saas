import { randomUUID } from 'crypto'

function slugifyName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'business'
}

// Sip Café pattern: slugify(name) + '-' + first 6 hex chars of the row id
// (e.g. "Sip Café" / ff5055a0-... -> "sip-ff5055"). Generating the id up front
// lets the slug be computed and set BEFORE the businesses insert, so a
// business can never exist without one — see businesses_slug_unique / the
// slug NOT NULL constraint this pairs with.
export function generateBusinessIdAndSlug(name: string): { id: string; slug: string } {
  const id = randomUUID()
  const slug = slugifyName(name) + '-' + id.slice(0, 6)
  return { id, slug }
}
