const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function toNullableUuid(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t === '' || t === 'null' || t === 'undefined') return null
  if (!UUID_RE.test(t)) return null
  return t
}
