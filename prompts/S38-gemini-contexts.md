# S38 — Gemini Context 5 Use-Cases
STATUS: ABSENT | MODE: SOLO
Covers: prompts/59
Goal: Add Gemini Flash as a second AI provider for 5 specific use-cases where it outperforms Haiku on cost/quality.

---

## RULE 0 — UPGRADE ONLY
Never replace existing Anthropic calls with Gemini. ADD Gemini as a NEW path only.
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.
Requires: GOOGLE_GEMINI_API_KEY in environment variables (founder must add to Vercel + .env.local)

## CONSTRAINT CATALOGUE
No new DB tables required. Uses aria_ai_calls with model_provider='google'.
Run live SQL to check aria_ai_calls.model_provider column exists:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='aria_ai_calls' AND column_name='model_provider';
```
If not present: migration to add it.

## Full implementation scope

### 5 Use-Cases for Gemini Flash

**1. Image analysis for receipt OCR**
- Current: claude-sonnet for receipt scan
- Add: Gemini Flash vision as a faster/cheaper path for simple receipts
- Route: /api/pos/receipt-scan → try Gemini first (cheaper), fall back to claude-sonnet on error
- Log: aria_ai_calls with model_provider='google', model_id='gemini-1.5-flash'

**2. Product description bulk generation**
- When importing products without descriptions: generate bulk via Gemini Flash (batch of 20+)
- Gemini's 1M context window handles large product batches in one call
- Route: /api/pos/products/backfill-descriptions (new) or extend backfill-images

**3. Competitor price web search**
- Gemini Flash with grounding for competitor price lookups
- Cheaper than using claude-sonnet web search for high-volume scans
- Route: /api/aria/competitor-prices → use Gemini Flash for bulk price lookups

**4. Social caption variants**
- Generate 3 caption variants for a social post
- Gemini Flash for speed; show variant picker in social post editor
- Route: /api/social/posts/caption-variants (new endpoint)

**5. Weekly report narrative**
- Weekly report prose summary (the "Aria says" paragraph)
- Gemini Flash for long-context synthesis of the week's data

### Provider wrapper

Create `src/lib/aria/providers/gemini.ts`:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
export async function callGemini(opts: { model: string; systemPrompt: string; userPrompt: string; maxTokens: number; businessId: string; agentKey: string }) : Promise<{ text: string; cost_cents: number }>
```
- Logs to aria_ai_calls with model_provider='google'
- Falls back to callAnthropic on any error (RULE 0: never degrade)

### Package
```
npm install @google/generative-ai
```

## Aria Intelligence Rule
- All Gemini calls → aria_ai_calls (model_provider='google', model_id='gemini-1.5-flash')
- Fallback to Anthropic on error → aria_ai_calls logs both attempts
- Never use Gemini for: council, briefing decisions, financial recommendations (keep Anthropic for trust-critical paths)

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist (15 min)
- [ ] GOOGLE_GEMINI_API_KEY added to Vercel env vars
- [ ] Receipt scan: upload a receipt → Gemini processes it (check aria_ai_calls model_provider='google')
- [ ] Product bulk description: import 5 products → descriptions generated
- [ ] Social caption variants: 3 variants appear in post editor
- [ ] Weekly report narrative: Gemini summary appears
- [ ] aria_ai_calls shows both google and anthropic entries

## Push
SOLO mode — stop before push. Write reports/sprint-S38-report.md.
