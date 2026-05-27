# Prompt 59 — Gemini Integration: 5 Free Use Cases

## Why this exists
Aria has `GEMINI_API_KEY` already in Vercel env vars (set May 16).
Gemini 3.x gives 5,000 free grounded search prompts/month.
Gemini Flash has excellent vision/OCR for receipt scanning.
Use Gemini where it adds unique value Claude cannot provide natively:
web grounding, vision OCR, competitor website reading.
Claude remains the brain for all reasoning and responses.
Gemini is the eyes and web fetcher.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. Check `GEMINI_API_KEY` format — is it a Google AI Studio key or Vertex AI key?
   Run: `grep -r "GEMINI" src/ | head -20` to see how it's currently used
2. `cat src/app/api/aria/daily-briefing/route.ts` — full read (17KB)
3. `cat src/lib/external-data.ts` OR wherever `getWeatherForecast` is defined — full read
4. `cat src/app/dashboard/receipt-scan/page.tsx` — full read (19KB)
5. `cat src/app/api/aria/competitor-watches/route.ts` — full read (5KB)
6. `cat src/app/api/aria/reviews/route.ts` — full read (5KB)
7. Check DB: `pos_receipt_scans` table columns via Supabase MCP

## Gemini client setup
Build `src/lib/gemini.ts` — single shared Gemini client:

```ts
import { GoogleGenerativeAI } from '@google/generative-ai'

const key = process.env.GEMINI_API_KEY
if (!key) throw new Error('GEMINI_API_KEY not set')

export const gemini = new GoogleGenerativeAI(key)

// Flash 2.5 — best for grounded search + vision, very cheap
export const geminiFlash = gemini.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: [{ googleSearch: {} }], // enables grounding
})

// Flash-Lite — for simple tasks, cheapest
export const geminiFlashLite = gemini.getGenerativeModel({
  model: 'gemini-2.5-flash-lite',
})

// Vision model for receipt/image OCR
export const geminiVision = gemini.getGenerativeModel({
  model: 'gemini-2.5-flash', // Flash has vision built in
})
```

Install package first: `npm install @google/generative-ai`

---

## USE CASE 1: Daily briefing — Gemini fetches external web context

### Problem
We removed web search from the daily briefing to cut costs.
The briefing now lacks: local news, industry updates, competitor promotions.

### Solution
Before Claude generates the briefing, Gemini Flash (grounded) fetches:
- Local suburb news and events
- Australian liquor/retail/cafe industry news (based on industry)
- Any detected competitor promotions
- Tomorrow's detailed weather (more accurate than current Open-Meteo)

### Where to add
In `src/app/api/aria/daily-briefing/route.ts`, find where external context is built (around L97-L244).
Add a Gemini grounded fetch BEFORE the Claude call:

```ts
import { geminiFlash } from '@/lib/gemini'

async function fetchGeminiExternalContext(business: { suburb?: string; city?: string; industry?: string }) {
  const location = business.suburb ?? business.city ?? 'Melbourne'
  const industry = business.industry ?? 'retail'
  
  try {
    const prompt = `You are a business intelligence assistant. Search the web and provide a brief JSON summary for a ${industry} business in ${location}, Australia. Return ONLY valid JSON, no preamble:
{
  "local_news": "1-2 sentences of relevant local news or events in ${location} today",
  "industry_news": "1-2 sentences of Australian ${industry} industry news today",  
  "weather_tomorrow": "brief weather description for ${location} tomorrow",
  "competitor_promos": "any detected promotions from major ${industry} competitors in Australia today, or null"
}`
    
    const result = await geminiFlash.generateContent(prompt)
    const text = result.response.text()
    const clean = text.replace(/\`\`\`json|\`\`\`/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return null // non-fatal — briefing continues without external context
  }
}
```

Add `gemini_context` to the external_context object passed to Claude.
This makes briefings smarter with zero extra Anthropic cost.
Log the Gemini call to `aria_ai_calls` table with model='gemini-2.5-flash', purpose='briefing-external-context'.

---

## USE CASE 2: Receipt scan — Gemini Vision for OCR

### Problem
Receipt/invoice scanning needs to extract: supplier name, date, line items (product name, qty, unit price, total), grand total, GST.
Claude handles this but Gemini Flash Vision is better at OCR and cheaper.

### Where to add
Find where receipt images are currently processed (check `src/app/api/pos/receipt-scan/route.ts` or similar).
If no API route exists, create `src/app/api/pos/receipt-scan/route.ts`.

Build Gemini vision extraction:
```ts
import { geminiVision } from '@/lib/gemini'

async function extractReceiptWithGemini(imageBase64: string, mimeType: string) {
  const prompt = `Extract all information from this supplier receipt/invoice. Return ONLY valid JSON:
{
  "supplier_name": "string",
  "invoice_date": "YYYY-MM-DD or null",
  "invoice_number": "string or null", 
  "line_items": [{"product_name": "string", "quantity": number, "unit_price": number, "line_total": number}],
  "subtotal": number,
  "gst_amount": number,
  "grand_total": number,
  "currency": "AUD"
}
All amounts in dollars (not cents). If unclear, use null.`

  const result = await geminiVision.generateContent([
    prompt,
    { inlineData: { data: imageBase64, mimeType } }
  ])
  
  const text = result.response.text()
  const clean = text.replace(/\`\`\`json|\`\`\`/g, '').trim()
  return JSON.parse(clean)
}
```

The receipt scan page already handles upload — wire Gemini Vision into the scan API endpoint.
Store result in `pos_receipt_scans` table.
Log to `aria_ai_calls`.

---

## USE CASE 3: Competitor website price extraction

### Problem
Competitor watches track names and ratings but not actual prices.
Aria needs to detect when competitors change prices or run promotions.

### Where to add
In `src/app/api/aria/competitor-watches/route.ts` GET handler, after fetching watches:
For each competitor with an active watch, use Gemini to check their current pricing:

```ts
async function checkCompetitorPrices(competitorName: string, businessSuburb: string, industry: string) {
  try {
    const prompt = `Search the web for current prices at "${competitorName}" in ${businessSuburb}, Australia.
For a ${industry} business, what are their current prices for their most popular products?
Are they running any current promotions or specials?
Return ONLY valid JSON:
{
  "found": boolean,
  "sample_prices": [{"product": "string", "price": number}],
  "current_promotions": "description or null",
  "price_level": "budget|mid|premium",
  "last_updated": "today"
}`
    const result = await geminiFlash.generateContent(prompt)
    const text = result.response.text().replace(/\`\`\`json|\`\`\`/g, '').trim()
    return JSON.parse(text)
  } catch {
    return null
  }
}
```

Only run this check if:
- Competitor has no price data in last 7 days (check `competitor_price_cache` table)
- Max 3 competitor price checks per business per day (rate limit to stay in free tier)

Store results in `competitor_price_cache`. Create `aria_competitor_alerts` if price changed >10%.
Log to `aria_ai_calls`.

---

## USE CASE 4: Social media competitor monitoring

### Problem
Aria watches competitors but doesn't know what they're posting on social media — promotions, new products, events.

### Where to add
In `src/app/api/social/posts/route.ts` OR create new `src/app/api/aria/social-intelligence/route.ts`.

```ts
async function fetchCompetitorSocialPosts(competitorName: string, city: string) {
  try {
    const prompt = `Search Instagram and Facebook for recent posts by "${competitorName}" in ${city}, Australia.
What have they posted in the last 7 days? Any promotions, new products, events, or special offers?
Return ONLY valid JSON:
{
  "recent_posts": [{"platform": "instagram|facebook", "content_summary": "string", "post_type": "promo|product|event|other", "detected_at": "today"}],
  "active_promotions": "description of any current deals or null",
  "engagement_level": "high|medium|low|unknown"
}`
    const result = await geminiFlash.generateContent(prompt)
    const text = result.response.text().replace(/\`\`\`json|\`\`\`/g, '').trim()
    return JSON.parse(text)
  } catch {
    return null
  }
}
```

Call this from the competitor monitoring cron (runs daily).
Cache results for 24hrs — one Gemini call per competitor per day.
Surface in competitors dashboard: "BWS posted a 25% off spirits promotion yesterday"
Log to `aria_ai_calls`.

---

## USE CASE 5: Review sentiment from competitor Google Maps

### Problem  
Reviews page shows your reviews but competitor review analysis needs their actual review text.

### Where to add
In `src/app/api/aria/competitor-review-analysis/route.ts` (created by prompt 42, may not exist yet — create if missing).

```ts
async function fetchCompetitorReviews(competitorName: string, suburb: string) {
  try {
    const prompt = `Search Google Maps and review sites for recent customer reviews of "${competitorName}" in ${suburb}, Australia.
What are customers saying? What do they complain about? What do they praise?
Return ONLY valid JSON:
{
  "average_rating": number,
  "review_count_estimate": number,
  "top_complaints": ["string"],
  "top_praises": ["string"],
  "recent_sentiment": "improving|declining|stable",
  "opportunity_for_competitor": "what a competing business could do better based on these complaints"
}`
    const result = await geminiFlash.generateContent(prompt)
    const text = result.response.text().replace(/\`\`\`json|\`\`\`/g, '').trim()
    return JSON.parse(text)
  } catch {
    return null
  }
}
```

Cache per competitor per week (reviews don't change daily).
Surface in reviews page: "Dan Murphy's customers complain about long queues and unhelpful staff"
This feeds directly into Aria's competitive opportunity detection.
Log to `aria_ai_calls`.

---

## Rate limiting — stay in free tier
5,000 free grounded searches/month = ~166/day.
Budget allocation:
- Briefing external context: 1/day per business (uses most budget when scaled)
- Competitor prices: max 3/day per business  
- Social monitoring: 1/competitor/day
- Receipt scans: on-demand (vision only, no grounding)
- Competitor reviews: 1/competitor/week

At soft launch (1-5 businesses): ~20-30 calls/day — well within free tier.
Add `gemini_calls_today` counter in Supabase or simple in-memory rate limiter.

Build rate limiter utility:
```ts
// src/lib/gemini-rate-limiter.ts
const MAX_DAILY_GROUNDED = 150 // buffer below 166/day free limit

export async function checkGeminiRateLimit(supabaseAdmin: any): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0]
  const { count } = await supabaseAdmin
    .from('aria_ai_calls')
    .select('id', { count: 'exact' })
    .eq('model', 'gemini-2.5-flash')
    .gte('created_at', `${today}T00:00:00Z`)
  return (count ?? 0) < MAX_DAILY_GROUNDED
}
```

## DB migrations
```sql
ALTER TABLE aria_ai_calls ADD COLUMN IF NOT EXISTS model_provider text DEFAULT 'anthropic';
-- competitor_price_cache already created in prompt 48
-- aria_competitor_alerts already exists
```

## Error handling rules
- ALL Gemini calls wrapped in try/catch — always non-fatal
- If Gemini fails → log error → continue without that data
- Never let Gemini failure block a user-facing response
- Claude is always the fallback brain

## Execution order
1. `npm install @google/generative-ai`
2. Run DB migrations via Supabase MCP
3. Build `src/lib/gemini.ts` — shared client
4. Build `src/lib/gemini-rate-limiter.ts`
5. Wire USE CASE 2 first (receipt scan — no grounding needed, simpler)
6. Wire USE CASE 1 (briefing external context)
7. Wire USE CASE 3 (competitor prices)
8. Wire USE CASE 4 (social monitoring)
9. Wire USE CASE 5 (competitor reviews)
10. `npx tsc --noEmit` — zero errors
11. `npm run build` — must pass
12. `git add -A && git commit -m "feat: Gemini integration — 5 use cases: briefing context, receipt OCR, competitor prices, social monitoring, review sentiment — free tier" && git push`
