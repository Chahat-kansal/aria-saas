# Image Helpers

## `getRelevantImage(query, options?)`

Fetches a relevant photo from Pixabay and caches it permanently in
Supabase Storage. Returns a stable CDN URL.

**First call** for a given query: ~1–2 s (Pixabay fetch + upload).  
**Repeat calls** for the same query: ~50 ms (cached URL returned immediately).

Images are stored under `reusable-images/cache/{sanitized-query}.jpg`.  
Pixabay License: free for commercial use, no attribution required.

### Usage

```typescript
import { getRelevantImage, getRelevantImages } from '@/lib/images/pixabay'

// Single image (server-side only)
const url = await getRelevantImage('flat white coffee')

// With options
const url = await getRelevantImage('empty inbox', {
  category: 'business',
  preferIsolated: true,
})

// Multiple varied images (carousel, AB test)
const urls = await getRelevantImages('avocado toast cafe', 3, {
  category: 'food',
  orientation: 'horizontal',
})
```

### Options

| Option           | Type                        | Default        | Description                                |
|------------------|-----------------------------|----------------|--------------------------------------------|
| `category`       | `'food' \| 'business' \| …` | `'all'`        | Pixabay image category filter              |
| `orientation`    | `'horizontal' \| 'vertical'`| `'all'`        | Image orientation                          |
| `preferIsolated` | `boolean`                   | `false`        | Prefer photos on white/transparent bg      |
| `minWidth`       | `number`                    | `400`          | Minimum image width in pixels              |

### Where to use

- Social post drafts (already wired — Pixabay is fallback #4 after Stability AI, DALL-E 3, Unsplash)
- Blog post hero images
- Industry preview screens in onboarding
- Empty state illustrations
- Marketing landing page sections
- Any AI-generated content that benefits from a photo

### Where NOT to use

- User-uploaded product images (use Supabase Storage direct)
- User avatars (use auth provider)
- Receipt thumbnails (generate from data)
- Business logos (owners upload their own)

## Cafe product images

Pre-fetched and stored in `pos-images/cafe/*.jpg` via `scripts/fetch-cafe-images.ts`.

Use `getCafeProductImage(productName)` from `@/lib/pos/cafe-image-map` for
type-safe lookup by product name — no runtime API call needed.

```typescript
import { getCafeProductImage } from '@/lib/pos/cafe-image-map'

const url = getCafeProductImage('Flat White')  // permanent Supabase CDN URL
```