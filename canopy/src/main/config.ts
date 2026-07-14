// SHELL-1 — confirmed live in the pre-flight report: https://www.ariaos.site is the canonical
// production URL (non-www redirects to it). Configurable via env for local dev against a different
// deployment (e.g. a Vercel preview URL) without editing source.
export const PRODUCTION_URL = process.env.CANOPY_APP_URL ?? 'https://www.ariaos.site'
