# Prompt 74 — Aria In-Store: Conversational AI Kiosk for Customers

## What this is
A conversational AI that customers talk to IN the shop — tablet or their own phone via QR.
Voice + text. Knows the real product catalogue, stock, prices. Recommends, upsells,
signs people up for loyalty, pulls recipe ideas from the web, and is genuinely FUN to use.
Every question becomes a demand signal the owner sees — including what customers
asked for that the shop does NOT stock ("missed demand").

This is a NEW major feature. Build carefully in phases, commit each.

## Pre-edit checklist (MANDATORY)
1. `cat src/app/api/public/widget/chat/route.ts` — the website chat (similar pattern, reuse logic)
2. Check DB: pos_products, pos_customers, businesses, widget_configs
3. `cat src/app/dashboard/website-chat/page.tsx` — config page pattern
4. Check how loyalty works: pos_customers loyalty_points/loyalty_tier, loyalty_tiers table

## PHASE 1 — Database + core chat API

### DB migrations (Supabase MCP)
```sql
CREATE TABLE IF NOT EXISTS instore_kiosk_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) UNIQUE,
  kiosk_name text DEFAULT 'Ask us anything',
  greeting text,
  personality text DEFAULT 'friendly',  -- friendly, witty, professional
  voice_enabled boolean DEFAULT true,
  loyalty_enabled boolean DEFAULT true,
  recipe_suggestions boolean DEFAULT true,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS instore_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  messages jsonb DEFAULT '[]',
  customer_id uuid REFERENCES pos_customers(id),
  email_captured text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS instore_demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  query_text text,
  product_asked text,        -- what they asked for
  in_stock boolean,          -- did we have it
  matched_product_id uuid,   -- if matched to a real product
  signal_type text,          -- 'answered', 'missed_demand', 'recommendation', 'recipe'
  created_at timestamptz DEFAULT now()
);
```

### Core chat route
Create `src/app/api/public/instore/chat/route.ts` — POST
- Takes `{ business_id, message, conversation_id?, visitor_id }`
- Loads business + FULL product catalogue with stock + kiosk config
- Builds a system prompt (see personality section below)
- Calls Claude (Haiku for speed — this must feel instant)
- After each turn, runs a lightweight extraction: did the customer ask for a product?
  Was it in stock? Log to instore_demand_signals with the right signal_type.
- If customer asks for something NOT in catalogue → signal_type 'missed_demand'
- Saves conversation to instore_conversations
- Returns the reply + any product cards + any recipe card

## PHASE 2 — Personality, fun, recipes

### The personality — make it FUN
The kiosk AI is not a corporate bot. It is warm, a little witty, genuinely helpful.
System prompt personality rules:
- Friendly and upbeat — like the best staff member on their best day
- Light humour where it fits — never forced, never cheesy, never at the customer's expense
- Australian, casual, warm. "Good pick!" "Ooh, great question." "Between you and me, the almond croissant is unbeatable."
- Playful when appropriate: if someone asks something silly, play along kindly
- Short replies — people are standing in a shop, not reading an essay
- Celebrates the customer: "Excellent taste" / "You're going to love that"
- NEVER sarcastic, never makes the customer feel dumb
- 3 personality modes in config: friendly (default), witty (more jokes), professional (minimal humour)
- Knows the business's products cold — recommends with genuine enthusiasm

Example good replies:
- "Oat milk? We've got it — oat, soy, lactose-free, the whole dairy-free dream team. No extra charge either."
- "A wine for a date night? Say no more. The Shiraz has never let anyone down. Pressure's on the conversation now though."
- "Honestly the almond croissant is the one. I'd recommend it even if no one was asking."

### Recipe suggestions from the web
When a customer asks something like "what can I make with X" or "dinner ideas" or
buys ingredients, Aria can suggest a recipe.
- Create `src/app/api/public/instore/recipe/route.ts`
- Uses web search (the API supports web_search tool — see how other routes do it,
  or use a simple recipe API) to fetch a real recipe idea
- Returns: recipe name, 3-4 key ingredients, a one-line "and you can grab the [X] and [Y] here"
  cross-referencing the shop's actual stock
- This turns "I'm just browsing" into a basket — genuinely clever
- Recipe card renders in the chat with the shop's matching products highlighted

### Upsell — natural, not pushy
When a customer shows interest in a product, Aria can suggest a genuine pairing
from co-purchase data (pos_sale_items — what sells together) or common sense.
"A flat white? The almond croissant is the local legend with that."
Never more than one upsell per topic. Never pushy. It should feel like helpful advice.

## PHASE 3 — Loyalty signup
- If loyalty_enabled and the customer seems happy / is wrapping up, Aria offers:
  "Want a free coffee on your 10th visit? Pop your email in and I'll set you up."
- If they give email: look up pos_customers — if exists, recognise them
  ("Welcome back Sarah! You've got 6 stamps — 4 more for a free one")
- If new: create a pos_customers record, confirm warmly
- Store email_captured on the conversation
- Privacy: only ever uses the email the customer themselves typed

## PHASE 4 — The customer-facing kiosk UI
Create `src/app/kiosk/[business_id]/page.tsx` — the public kiosk page
- Full-screen, touch-friendly, big text — works on a tablet
- Financial Trust palette, but warm and inviting (this faces customers, make it delightful)
- Big chat area, product cards render inline, recipe cards render inline
- VOICE: mic button — use the browser Web Speech API (SpeechRecognition for input,
  SpeechSynthesis for Aria talking back). Voice + text both work.
- Idle state: a friendly looping prompt — "Ask me anything — what's good today, what's in stock, gift ideas…"
- Fun micro-touches: a subtle wave animation on greeting, Aria "thinking" with personality
  ("hmm, good one…"), celebrate loyalty signup with a small confetti moment
- Fast — Haiku, minimal latency, feels instant

## PHASE 5 — Owner side
### Kiosk config in dashboard
Create `src/app/dashboard/in-store/page.tsx`
- Toggle kiosk on/off, set kiosk name + greeting
- Personality picker: friendly / witty / professional
- Toggles: voice, loyalty signup, recipe suggestions
- QR code generator — generates a QR encoding the kiosk URL: https://ariaos.site/kiosk/{business_id}
  - Use the `qrcode` npm package (npm install qrcode) to render the QR as an SVG/PNG in-page
  - Owner sees the QR on screen + a "Download QR" button (saves PNG) + a "Print QR poster" button
  - The print poster: a nice A5 layout — shop name, "Scan to ask us anything", the QR, Aria branding
  - Also show the plain kiosk URL as text so the owner can use it on a tablet directly
- Link to the tablet kiosk URL — owner opens https://ariaos.site/kiosk/{business_id} on any tablet, bookmarks it, done

### Demand insights — THE killer feature
On the same in-store dashboard page, a "What customers asked for" section:
- Most-asked products this week (bar chart from instore_demand_signals)
- MISSED DEMAND highlighted: "14 customers asked for gluten-free — you don't stock any.
  Estimated $90 of demand. Want Aria to add it to your reorder?"
- Metric cards: questions answered, emails captured, items recommended, missed demand $
- AI summary (Haiku): "This week customers most wanted X. You're losing Y to missed demand. Stock Z."

## Rules
- All AI = Haiku (claude-haiku-4-5-20251001) — speed matters, log to aria_ai_calls
- The kiosk is PUBLIC — no auth, but rate-limit and never expose other businesses' data
- Never invent products, stock, or prices — only real catalogue data
- Voice uses browser Web Speech API — no paid voice service needed
- Fun but never cringe — warmth and wit, not forced jokes
- Phased commits — each phase its own commit
- npx tsc --noEmit + npm run build after each phase

## Execution order
1. Phase 1 — DB + core chat API → commit
2. Phase 2 — personality + recipes + upsell → commit
3. Phase 3 — loyalty signup → commit
4. Phase 4 — kiosk UI with voice → commit
5. Phase 5 — owner config + demand insights → commit

## Commit messages
- "feat: Aria In-Store phase 1 — DB schema + conversational kiosk chat API"
- "feat: Aria In-Store phase 2 — personality, web recipe suggestions, natural upsell"
- "feat: Aria In-Store phase 3 — loyalty signup + returning customer recognition"
- "feat: Aria In-Store phase 4 — customer kiosk UI with voice (Web Speech API)"
- "feat: Aria In-Store phase 5 — owner config, QR code, missed-demand insights"

## If limit runs low
Phases 1-2 give a working voice/text kiosk that answers questions and tracks demand.
That alone is the core product. Finish current phase, commit, STOP.
