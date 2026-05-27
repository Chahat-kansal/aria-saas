# Prompt 69 — Website Chat Widget: Smart Upgrade (Stock, Availability, Membership)

## Goal
Make the website chat widget genuinely intelligent — real stock, no double-bookings,
and able to recognise returning customers and tell them their loyalty status.
The widget already knows business details + products + books appointments.
This prompt fixes 4 gaps + adds membership recognition.

## Pre-edit checklist (MANDATORY)
1. `cat src/app/api/public/widget/chat/route.ts` — full read (9KB)
2. `cat src/app/dashboard/website-chat/page.tsx` — widget config UI
3. Check DB: `widget_configs` columns, `bookings` columns
4. Confirmed: `pos_customers` has loyalty_points, loyalty_balance, points_balance, loyalty_tier
5. Check `loyalty_tiers` table exists (from prompt 50) — tier names, perks, multipliers

## Fixes

### Fix 1: Always load product context (not just when show_prices)
Currently products only load if `config.show_prices` is true.
Change: ALWAYS load products so the AI knows what the business sells.
`show_prices` should only control whether PRICES are shown — not whether products load.
- If show_prices true: include name + price + description
- If show_prices false: include name + description only (no price)
Either way the AI knows the catalogue.

### Fix 2: Real-time stock awareness
When loading products for context, include current stock status.
For each product, add a stock note:
- stock_quantity > 5: (in stock)
- stock_quantity 1-5: (low stock)
- stock_quantity 0: (currently unavailable)
In the system prompt, instruct: "If a visitor asks about an unavailable product, tell them it is currently out of stock and offer to notify them or suggest an alternative."

### Fix 3: Booking availability check — prevent double bookings
Before confirming ANY booking, check existing bookings for that date/time.

Add a helper in the route:
```ts
async function checkSlotAvailable(businessId: string, date: string, time: string, config: any): Promise<boolean> {
  const maxPerSlot = config.max_bookings_per_slot ?? 1
  const { data: existing } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('business_id', businessId)
    .eq('booking_date', date)
    .eq('booking_time', time)
    .neq('status', 'cancelled')
  return (existing?.length ?? 0) < maxPerSlot
}
```

In the booking flow:
- When AI detects booking_confirmed JSON, FIRST call checkSlotAvailable
- If slot is free: create the booking as normal
- If slot is full: do NOT create booking. Return a message to the AI flow telling the visitor that time is taken, and the AI should offer alternative times
- The system prompt must instruct the AI: "Before confirming a booking time, you will be told if the slot is available. If not, suggest 2-3 alternative times."

Add `max_bookings_per_slot` to widget_configs (default 1).

### Fix 4: Pull richer business context
Currently only business name + industry + products.
Also load and include in system prompt:
- Business opening hours (so AI can say "we're open until 5pm today")
- Business phone + email (so AI can give real contact details)
- Recent Google rating if available (businesses.google_average_rating)
- Top 3 best-selling products (from pos_sale_items last 30 days) — "our most popular items are..."

### Fix 5: Membership / loyalty recognition — NEW capability
This is the big one. When a returning customer chats, recognise them.

How it works:
- The widget can ask early in conversation: "Are you a member? Pop in your email or phone and I can check your rewards."
- When visitor provides email or phone, look them up in `pos_customers` for that business
- If found, load their loyalty data: loyalty_points / points_balance, loyalty_tier
- If `loyalty_tiers` table has data, load their tier's perks
- Tell them: "Welcome back [name]! You're a [Gold] member with [340] points. As a Gold member you get [10% off + free coffee on birthdays]."
- The AI can then answer "what are my benefits?", "how many points do I have?", "what do I get as a member?"

Add a helper:
```ts
async function lookupCustomer(businessId: string, emailOrPhone: string) {
  const { data } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name, loyalty_points, points_balance, loyalty_balance, loyalty_tier')
    .eq('business_id', businessId)
    .or(`email.eq.${emailOrPhone},phone.eq.${emailOrPhone}`)
    .maybeSingle()
  if (!data) return null
  // Load tier perks if tier exists
  let tierPerks = null
  if (data.loyalty_tier) {
    const { data: tier } = await supabaseAdmin
      .from('loyalty_tiers')
      .select('tier_name, perks, points_multiplier')
      .eq('business_id', businessId)
      .eq('tier_name', data.loyalty_tier)
      .maybeSingle()
    tierPerks = tier
  }
  return { ...data, tierPerks }
}
```

Add a tool/flow: when the AI response contains a customer lookup request (visitor gave email/phone), call lookupCustomer and feed the result back into the conversation context.

Privacy: only reveal loyalty info if the email/phone matches a real customer. Never invent membership data. If not found, say "I can't find a membership with those details — would you like to join? It's free."

### Fix 6: Widget config additions
In `src/app/dashboard/website-chat/page.tsx`, add config toggles:
- "Recognise members" (on/off) — enables loyalty lookup
- "Max bookings per time slot" (number, default 1)
- Make clear show_prices only controls price display, not product knowledge

## DB migrations
```sql
ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS max_bookings_per_slot integer DEFAULT 1;
ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS recognise_members boolean DEFAULT true;
```

## System prompt additions
The widget AI system prompt must now include:
- Full product list with stock status
- Business hours, phone, email
- Top sellers
- Instruction on booking availability (slot checking)
- Instruction on membership recognition + how to look up
- Privacy rule: never invent loyalty data, only state what the lookup returns

## Important rules
- Never expose other customers' data — only look up the exact email/phone the visitor provides
- Never invent loyalty points, tiers, or benefits — only state real looked-up data
- The widget must still work for businesses with no loyalty program (graceful — just skip membership)

## Execution
1. Run DB migrations via Supabase MCP
2. Read full widget chat route + config page
3. Apply all 6 fixes — additive, careful str_replace
4. `npx tsc --noEmit` — zero errors
5. `npm run build` — must pass
6. Single commit: "feat: website chat — real stock, booking availability, membership recognition, richer business context"
