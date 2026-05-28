# Prompt 96 - Kiosk welcome chooser + structured response formatting

## Two real bugs verified live

### Bug 1 - Welcome chooser never built
Prompt 90 specified that `/in-store/{slug}` should show a two-button chooser
("Ask Aria a question" | "Skip the queue - scan as you shop") when the
business has scan-and-go enabled. The chooser was never built.

Verified live (28 May 2026): `ariaos.site/in-store/sip-ff5055` shows only the
auth gate ("Scan the QR in-store"). The cart page DOES exist at
`/in-store/{slug}/cart` (returns 200, renders properly). But there is no way
for a customer to reach it - no link, no button, no chooser anywhere in the
kiosk flow.

### Bug 2 - Aria kiosk responses render as raw markdown
The chat UI renders Aria's reply as a plain text string. So when Aria replies
with `**Smoothie**, **Avocado Toast**, **Chocolate Smoothie**` the customer
sees the literal asterisks, not bolded items or a proper menu card.

For comparison: prompt 86 fixed the same bug on `/pos/ask` by wiring up
`data.blocks` and BlockRenderer. The kiosk chat needs the same treatment.

## Task 1 - Build the welcome chooser

### Route
New file: `src/app/in-store/[business_id]/welcome/page.tsx`

### Behaviour
1. On mount, read `?t=` from URL. POST to `/api/in-store/redeem-token` (existing).
   If response sets the session cookie, continue. If not, redirect to the
   parent `/in-store/{business_id}` (auth gate).
2. Fetch `/api/public/instore/config?slug={business_id}` to read whether the
   business has scan-and-go enabled (`instore_kiosk_configs.scan_and_go_enabled`).
3. Render two cards:
   - **PRIMARY**: "Skip the queue - scan as you shop" (lime accent, large, gets
     more visual weight). Tapping -> `/in-store/{slug}/cart`. Hidden if
     scan_and_go_enabled = false.
   - **SECONDARY**: "Ask Aria a question" (white card, ink border).
     Tapping -> `/in-store/{slug}/chat` (the existing chat page).
4. If scan-and-go is OFF for this business, skip the chooser entirely - POST
   the token, set cookie, redirect directly to `/in-store/{slug}/chat`. No
   wasted tap for cafes that don't have barcodes.
5. Visual: Pipel design system (light, hard ink borders, Inter, lime accent).
   Match the cart page that already exists at `/in-store/{slug}/cart`.

### Routing change
The current `/in-store/[business_id]/page.tsx` should now redirect to
`/welcome?t={token}` when a token is in the URL, so the welcome page becomes
the new landing instead of the chat page going straight to chat.

### DB
Verify `instore_kiosk_configs` has a `scan_and_go_enabled boolean` column. If
not, add it:
```sql
ALTER TABLE instore_kiosk_configs
  ADD COLUMN IF NOT EXISTS scan_and_go_enabled boolean DEFAULT false;
```

### Commit
"feat(kiosk): welcome chooser page - fork to scan-and-go or chat after token redeem"

## Task 2 - Render structured responses in kiosk chat

### Current bug
`src/app/in-store/[business_id]/chat/page.tsx` (or wherever the chat lives -
find it) renders the message as `<div>{message.text}</div>`. So markdown like
`**bold**` shows literal asterisks.

### Fix - three layers

**Layer 1: System prompt change.** In the kiosk chat API route (likely
`/api/public/instore/chat/route.ts`), update the Anthropic system prompt to
prefer STRUCTURED blocks over markdown for any list-shaped answer. Add to the
system prompt:

```
When listing items (menu items, products, hours, options, recommendations),
respond using structured blocks instead of inline markdown:

- For menu lists: use a "menu_list" block with items array, each having {name, price, category?, description?}
- For comparisons: use a "table" block
- For a single highlighted item: use a "recommendation_card" block
- For images of products: use an "image" block
- For free-form prose: use plain text WITHOUT markdown formatting (no **, no #, no bullets)

NEVER use markdown asterisks or hashes in the text response. Either it is a
structured block, or it is plain conversational prose.
```

Then in the API response, return `{ response: <plain text>, blocks: [...] }`
the same way `/api/aria/ask` does (verified in prompt 86).

**Layer 2: Frontend renders blocks.** Re-use the `BlockRenderer` component
built in prompt 86 (`src/components/aria/BlockRenderer.tsx`). Import it into
the kiosk chat page. When a message has `blocks`, render those below the text.

For the kiosk specifically, ensure the BlockRenderer styles are Pipel-themed
(light), not dashboard-themed (dark). If BlockRenderer is currently styled for
dark dashboard only, accept a `theme="light"` prop and override.

**Layer 3: Defensive markdown stripping for safety.** Some replies will still
slip through with `**` or `#` even with the system prompt. As a safety net,
add a small markdown-to-plain-text pass on the response text before rendering:

```typescript
function stripBasicMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
}
```

This makes the chat look clean even when the AI ignores the system prompt
instruction. Belt and suspenders.

### Specific block templates the kiosk should use

When customer asks "what is on the menu" or similar:

```json
{
  "response": "Here is what we have today:",
  "blocks": [
    {
      "type": "menu_list",
      "title": "Drinks",
      "items": [
        {"name": "Piccolo", "price": "$4.50", "description": "Strong coffee, small cup"},
        {"name": "Latte", "price": "$5.00"}
      ]
    },
    {
      "type": "menu_list",
      "title": "Food",
      "items": [
        {"name": "Avocado Toast", "price": "$14"},
        {"name": "Scone", "price": "$6"}
      ]
    }
  ]
}
```

Add a `menu_list` block type to BlockRenderer if it does not exist yet. Layout:
section title, then a 1-column list with each item showing name + price right-
aligned, with optional description underneath in muted text. Border between
items, no other chrome. Like a printed menu.

When customer asks "what is good today" (a recommendation):

```json
{
  "response": "Two things stand out today:",
  "blocks": [
    {
      "type": "recommendation_card",
      "name": "Ethiopian Cold Brew",
      "price": "$5.50",
      "reason": "Just brewed this morning, only 6 left",
      "image_url": "..."
    },
    {
      "type": "recommendation_card",
      "name": "Almond Croissant",
      "price": "$6",
      "reason": "Today is bake day - usually out by 11am"
    }
  ]
}
```

`recommendation_card`: large card with name (Fraunces italic), price, the
reason in muted text below, optional image to the left.

### Commit
"fix(kiosk-chat): structured blocks + markdown stripping - replies look like a menu, not raw markdown"

## Task 3 - Surface scan-and-go from inside the chat too

When Aria answers a "do you have X?" question and the item is in stock, return
an action_card block:
- Title: "Yes, we have it"
- Body: "{product name} - {price}"
- Buttons: [`Add to basket` -> goes to `/in-store/{slug}/cart` with the
  product pre-added, `Tell me more` -> continues chat]

This makes scan-and-go feel native rather than hidden behind a separate path.

### Commit
"feat(kiosk-chat): action_card 'Add to basket' button when Aria confirms in-stock items"

## Rules
- Each task is its own commit
- npx tsc --noEmit + npm run build pass before each commit
- After each commit: git push origin main
- The kiosk visual system is Pipel (light, lime accent, hard ink borders) -
  do NOT regress to the dashboard dark theme

## Priority if limit runs low
1. Task 1 (welcome chooser) - without this, scan-and-go is invisible
2. Task 2 layer 3 (markdown stripping) - fastest win for the ugly-asterisks bug
3. Task 2 layers 1+2 (structured blocks + BlockRenderer) - bigger but better
4. Task 3 (action_card in chat) - nice-to-have

Finish current commit, push, STOP, report.
