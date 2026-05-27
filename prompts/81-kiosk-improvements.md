# Prompt 81 — Aria In-Store Kiosk: 5 Real Improvements

## Scope
Five focused improvements to the existing kiosk at src/app/in-store/[business_id]/page.tsx
and src/app/api/public/instore/chat/route.ts. All ADDITIVE — never break what works.

The kiosk is live and answering questions today. These changes make it feel instant
and helpful in the moments where it currently feels slow or stuck.

## Pre-edit checklist
1. cat src/app/in-store/[business_id]/page.tsx — current kiosk UI
2. cat src/app/api/public/instore/chat/route.ts — current chat route
3. cat src/app/dashboard/in-store/page.tsx — owner config

## IMPROVEMENT 1 — Server-side stall safety net
Even with the "never stall" rule in the system prompt, Haiku may still occasionally
write a stall phrase. Add a defensive net.

In src/app/api/public/instore/chat/route.ts, AFTER getting replyText from Claude:
- Detect stall phrases with a regex: /\b(let me check|give me (a sec|just a sec|a moment|one sec)|hold on|one moment|let me grab|let me look|let me find out|just a sec|wait a sec)\b/i
- If matched: do ONE retry call to Claude with an extra system message:
  "Your previous reply contained a stall phrase. The product catalogue is RIGHT HERE.
   Answer the customer NOW using the catalogue. Never write 'let me check' or 'give me a sec'."
- Use the retry response. If the retry ALSO stalls, fall back to a hardcoded reply:
  "Honestly, your best bet right now is asking the staff — they'll know."
- Log every stall detection to aria_ai_calls so we can see how often it happens

## IMPROVEMENT 2 — Suggested question chips
On the kiosk's empty state (no messages yet), show 3-4 tappable starter chips.
Industry-aware:
- cafe: "What's good today?" / "Got oat milk?" / "Best with a flat white?"
- liquor: "Wine for steak?" / "Gift under $50?" / "What's new in?"
- retail (default): "What's new today?" / "Got [popular category]?" / "Gift ideas?"
Tapping a chip = same as typing the question and hitting send.
- Pull industry from the kiosk config or businesses.industry
- Chips disappear once the customer sends any message
- Component: simple flex-wrap of pill-shaped buttons, sage/forest theme matching kiosk

## IMPROVEMENT 3 — Streaming responses
Current: API waits for Haiku to finish all 300 tokens, then sends one big reply.
New: stream the reply token-by-token so words appear instantly.

In the chat route:
- Use anthropic.messages.stream() instead of .create()
- Return a ReadableStream / Server-Sent Events response
- Still do the post-processing (product cards, demand signals, conversation save)
  AFTER the stream completes — in a flush step
- IMPORTANT: the product_cards / upsell / suggest_recipe / suggest_loyalty_signup
  fields currently returned MUST still be delivered. Two clean ways:
  (a) Send a final SSE event with the metadata after [DONE]
  (b) Two-phase: stream text, then a separate metadata fetch using the conversation_id
  Pick (a) — single connection, simpler.

In the kiosk page:
- Parse the SSE stream, append tokens to the current assistant message as they arrive
- When the final metadata event arrives, render product cards + upsell + trigger
  recipe fetch / loyalty prompt as before
- TTS (voice) should speak the COMPLETE reply once streaming finishes, not per-token

## IMPROVEMENT 4 — "Talk to staff" button
A small ghost button at the bottom of the kiosk: "Talk to staff →"
Tapping it:
- Creates an aria_autopilot_actions row with category 'kiosk_help_request',
  title "Customer at kiosk needs help", description with last 2 conversation messages
- Sends an SMS to the owner via ClickSend (using existing sendSMS lib)
  "Customer at the in-store kiosk needs help right now. View: [link to conversation]"
- Shows the customer a friendly confirmation: "Got it — flagging this for someone now.
  They'll be with you in a moment."
- Owner opens dashboard → sees the autopilot action → can mark resolved

Endpoint: POST /api/public/instore/help — { business_id, conversation_id }
Rate-limit: max 1 help request per device per 5 minutes (prevent spam)

## IMPROVEMENT 5 — Anonymous repeat-visit memory
If the same device comes back to the kiosk, recognise them — without any login.

DB migration:
```sql
CREATE TABLE IF NOT EXISTS instore_visitor_memory (
  visitor_id text PRIMARY KEY,         -- a uuid generated in the browser, stored in localStorage
  business_id uuid REFERENCES businesses(id),
  last_visit_at timestamptz DEFAULT now(),
  visit_count integer DEFAULT 1,
  last_topics jsonb DEFAULT '[]',      -- short list of last few things they asked about
  last_recommended jsonb DEFAULT '[]', -- product names Aria last recommended
  created_at timestamptz DEFAULT now()
);
ALTER TABLE instore_visitor_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instore_visitor_memory_anon_upsert" ON instore_visitor_memory
  FOR ALL TO anon USING (true) WITH CHECK (true);
```
Important: this is anonymous — `visitor_id` is a random UUID from the browser,
not tied to any account, never personally identifying. No email, no name, no
device fingerprinting. Just a cookie-style stable ID per device.

Kiosk page:
- On load, get/create a `visitor_id` in localStorage (uuid v4)
- Send `visitor_id` with every chat request (already supported in the existing schema)
- On a returning visitor (visit_count > 1, last_visit_at > 1 hour ago):
  show a one-line welcome above the chat: "Welcome back! Last time you were
  looking at [last_recommended[0]]." — only if there's a real previous topic.
- Never invent a memory. Only show what's stored.

Chat route:
- After saving the conversation, upsert instore_visitor_memory:
  visit_count += 1, last_visit_at = now(), append the latest product mentions
  to last_recommended (keep only the most recent 5)
- Include a short "Returning visitor — last time they asked about X, Aria
  recommended Y" line in the system prompt context if memory exists
- NEVER expose another visitor's memory — visitor_id is the key

## Rules
- All ADDITIVE — never break the existing kiosk
- Streaming MUST gracefully handle the case where the stream breaks midway
- Stall regex MUST be tight — false positives would re-prompt unnecessarily
- Suggested-question chips MUST be ≤5 words each
- Help button rate-limited to prevent spam
- visitor_id is anonymous — no PII ever attached
- npx tsc --noEmit + npm run build must pass
- Commit per improvement so any one can be rolled back if it breaks:
  - "feat: kiosk — server-side stall safety net"
  - "feat: kiosk — suggested-question chips on empty state"
  - "feat: kiosk — streaming chat responses for instant feel"
  - "feat: kiosk — talk to staff button + SMS owner notification"
  - "feat: kiosk — anonymous repeat-visit memory"
- Migrations via Supabase MCP

## If limit runs low
Build in this order — most value first:
1. Streaming (biggest UX win)
2. Suggested chips (next biggest, smallest code)
3. Stall safety net (defensive, tiny)
4. Talk to staff (real safety valve)
5. Repeat-visit memory (delightful but optional)
Finish whichever phase you're in, commit it, STOP.
