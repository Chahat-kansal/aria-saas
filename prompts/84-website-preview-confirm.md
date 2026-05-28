# Prompt 84 — Website confirmation preview (SEO + Community)

## What this fixes
When a business owner types or edits their website URL anywhere in the app — the
SEO page, the community profile page — the app accepts it silently. There is no
"is this really your website?" check. So typos, wrong domains, or stolen-from-
clipboard URLs get crawled and embedded without anyone noticing.

The fix: fetch the live website server-side, extract its metadata (title,
description, favicon, og:image), and show the owner a preview card. They click
"Yes, this is my site" → save. They click "No, fix it" → return to the input.

## Pre-edit checklist
1. Read src/app/dashboard/seo/page.tsx — current "Change URL" flow
2. Read src/app/api/seo/crawl/route.ts — how the website is currently validated
3. Find the community profile edit page (likely src/app/dashboard/community/profile/page.tsx)
4. Check if any existing route does URL preview fetching (search for `og:image`, `metaTags`, `link-preview` in lib/) — reuse if so

## Build

### New API route — site preview fetcher
`POST /api/site-preview` (auth required)
Body: `{ url: string }`

Server side:
1. Validate the URL:
   - Trim whitespace
   - If no protocol, prepend `https://`
   - Reject `javascript:`, `data:`, `file:`, `ftp:`
   - Reject hosts under 4 chars or without a dot
   - Reject IPs and localhost
2. `fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(7000) })`
   - 7-second timeout — slow sites should fail gracefully
   - User-Agent: `Mozilla/5.0 (compatible; AriaPreview/1.0; +https://ariaos.site)`
   - Follow redirects (up to 5) so `globalliquor.com.au` → `https://www.globalliquor.com.au` resolves
3. Read response.text(), extract via regex or `cheerio`/`node-html-parser`:
   - Final URL after redirects
   - `<title>` content
   - `<meta name="description">` or `<meta property="og:description">`
   - `<meta property="og:image">` — absolute URL only
   - Favicon — prefer `<link rel="icon">`, fallback to `${origin}/favicon.ico`
4. Return:
```ts
{
  ok: true,
  finalUrl: string,
  title: string | null,
  description: string | null,
  ogImage: string | null,
  favicon: string | null,
  domain: string,            // www-stripped
  isHttps: boolean,
}
```
5. On any failure (DNS, timeout, 4xx, 5xx, bad HTML), return:
```ts
{ ok: false, error: 'site_unreachable' | 'site_blocked' | 'invalid_url', message: string }
```

### Security guards
- Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x) AFTER DNS resolution — prevents SSRF to internal services
- Block requests >2MB
- Strip script and tracker content from response before parsing
- Cache successful previews in memory for 5 minutes (cheap rate-limit)
- Hard rate-limit per user: 20 previews per minute

### New reusable component
`src/components/SitePreviewCard.tsx`
Props: `{ preview: SitePreview, onConfirm, onReject, busy }`

Layout (mobile-first, light theme, ink-on-cream):
```
┌──────────────────────────────────────────┐
│ ┌─favicon─┐                              │
│ │   16x16 │ globalliquor.com.au          │
│ └─────────┘                              │
│                                          │
│ ┌──────────og-image──────────────────┐   │
│ │     (or gradient placeholder)      │   │
│ └────────────────────────────────────┘   │
│                                          │
│ Global Liquor — Bentleigh East           │ ← title
│ Family-owned bottle shop, est. 1994.     │ ← description (2 lines max)
│                                          │
│ [ Yes, that's my site ]  [ No, fix it ]  │
└──────────────────────────────────────────┘
```

- "Yes" button: lime accent (matching design system), confirms and saves to businesses.website
- "No" button: white with ink border, returns to the input
- Show "Couldn't load preview" state when API returns ok:false, with the error message + a "Save anyway" link (sometimes legitimate sites block bots — give an escape hatch but warn)

### Where to wire it in

#### Place 1 — SEO dashboard (`src/app/dashboard/seo/page.tsx`)
Current flow: type URL → "Change URL" button → silently saves → "Run crawl now" starts crawling.

New flow:
- Type URL → click "Change URL" → calls `/api/site-preview`
- Show the SitePreviewCard inline above the input
- "Yes" → saves to `businesses.website`, clears the preview, shows the regular SEO state
- "No" → keeps the input focused with the value, lets them edit
- Loading state: button shows spinner, "Fetching your site..."

#### Place 2 — Community profile edit
Same component, same flow. After "Yes" → save to `businesses.website` (same column reused).

#### Place 3 — Onboarding wizard (if there's a website step)
Find onboarding URL step — wire same preview into it.

## Rules
- Re-use `businesses.website` column everywhere — DO NOT create a parallel column
- Light theme, hard 1.5px ink borders matching the locked Pipel design system
- Single source of truth: SitePreviewCard component used in all 3 places
- Preview must work for sites that block iframe embedding (most do) — that's why we fetch server-side, not iframe
- Graceful failure: if the preview fails, the owner can still "Save anyway" — never trap them
- npx tsc --noEmit + npm run build before commit
- Single commit: "feat: website confirmation preview before save (SEO, community, onboarding)"
- Then: git push origin main
