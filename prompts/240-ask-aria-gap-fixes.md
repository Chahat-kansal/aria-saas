# CLAUDE CODE PROMPT — Ask Aria: 3 Gap Fixes

Paste this whole file to Claude Code. One commit per fix. Build gate (`npx tsc --noEmit` + `npm run build`) before every commit. RULE 0: never remove or weaken anything existing. `pwd` = `C:\Users\kansa\aria-saas-audit`.

---

## CONTEXT — what was verified before writing this prompt (trust this over assumptions)

Read these files in full before touching anything:
- `src/app/api/aria/ask/route.ts` (1089 lines) — the main Ask Aria route
- `src/lib/aria-tools.ts` — all tool definitions + `executePOSTool` switch
- `src/lib/aria/ask/action-planner.ts` — `ActionType` union + `PlannedAction` interface
- `src/lib/aria/ask/action-executor.ts` — the `executeAction` switch

### Verified facts (confirmed from live code + live DB):
1. **Web search IS already wired** — line 882–886 adds `{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }` to `allTools`. Anthropic handles this server-side; Claude never calls `executePOSTool` for it. The native web search works. The ONLY bug is the pre-search benchmark at ~line 871 calls `executePOSTool('web_search', ...)` which has no case in the switch → silently returns `undefined`. Fix that one line.
2. **`query_bank_balance` tool exists but `basiq_connections` table does NOT** — confirmed via live DB. No Basiq integration is built. Make it fail gracefully.
3. **`pos_rosters` table EXISTS** with columns: id, business_id, outlet_id, week_start (date), shifts (jsonb), total_hours (numeric), total_cost_cents (integer), published (boolean), published_at, generated_by_agent (boolean), status (text), aria_reasoning (text), approved_by (uuid), updated_at. `generated_by_agent` = true must be set for Aria-created rosters.
4. **`invoices` table EXISTS** with columns: id, business_id, customer_id, invoice_number (text), status (text), bill_to_name, bill_to_email, bill_to_address, subtotal (numeric), gst_total (numeric), total (numeric), currency (text), notes (text), issue_date (date), due_date (date), sent_at, paid_at, send_method (text), pdf_url (text), ai_generated (boolean), auto_reminders (boolean), created_at, updated_at.
5. **`invoice_items` table may or may not exist** — dump `information_schema.columns WHERE table_name = 'invoice_items'` BEFORE writing any insert. If it doesn't exist, create it via migration first (see Fix 3).
6. Money in `invoices` is stored as DOLLARS (numeric), not cents. `total_cost_cents` in `pos_rosters` is in CENTS. Do NOT mix these up.

---

## FIX 1 — Pre-search benchmark fallback (1 line change)

**File:** `src/app/api/aria/ask/route.ts`

**Problem:** ~line 871 calls `executePOSTool('web_search', { query: searchQuery }, bid)`. `executePOSTool` has no `web_search` case → returns `undefined` silently. The native `web_search_20250305` tool in `allTools` works correctly (Anthropic handles it server-side) — this pre-search is just a bonus context-enrichment step.

**Fix:** Replace the `executePOSTool('web_search', ...)` call with a direct fetch to a search API, OR simply remove the pre-search benchmark block (lines ~869–876) since the native web search tool already gives Aria real-time search on every response. The native tool is better anyway — it searches in context of the actual question, not a generic benchmark query.

**Preferred fix — remove the pre-search block entirely:**
Find and delete these lines (confirm line numbers by reading the file first):
```ts
try {
  const searchQuery = (ctx.industry || 'small business') + ' ' + (ctx.city ?? 'Australia') + ' average revenue benchmark 2025'
  const searchResult = await executePOSTool('web_search', { query: searchQuery }, bid)
  systemPrompt += '\n\nLIVE BENCHMARK DATA (just fetched):\n' + JSON.stringify(searchResult).slice(0, 800) + '\nUse these benchmarks to contextualise the owner\'s numbers. Do not say "based on the search" — weave it in naturally.'
} catch { /* non-fatal */ }
```
The native `web_search_20250305` in `allTools` (already present) replaces this entirely. Aria will search when it needs to.

**Commit:** `fix(ask-aria): remove broken pre-search benchmark; native web_search_20250305 already wired`

**Acceptance:** Ask Aria a business benchmark question ("how does my revenue compare to other cafes?") — Aria should use the native web search tool and return a response with live benchmarks. No silent undefined errors in logs.

---

## FIX 2 — `query_bank_balance` graceful failure (no Basiq integration)

**File:** `src/lib/aria-tools.ts`

**Problem:** The `query_bank_balance` tool is listed in `ARIA_POS_TOOLS` and has a case in `executePOSTool`, but it queries `basiq_connections` which does not exist in the live DB. Supabase returns an error silently, Aria gets empty data, and returns confusing or wrong answers about bank balance.

**Fix — two parts:**

**Part A:** In `executePOSTool`, find the `case 'query_bank_balance':` handler. Replace the Supabase query with a clear not-connected response:
```ts
case 'query_bank_balance':
  return {
    connected: false,
    message: 'Bank account not connected. To see live bank balance, connect your bank account in Aria Settings → Integrations → Bank Feed (Basiq). Until then, Aria can only show POS revenue — not bank balance.',
    bank_balance: null,
    last_synced: null,
  }
```

**Part B:** In the `query_bank_balance` tool definition in `ARIA_POS_TOOLS`, update the description to:
`'Check bank account balance and recent transactions. Note: requires bank connection in Settings → Integrations.'`
This gives Aria the right context so it tells the user to connect their bank rather than pretending data exists.

**Commit:** `fix(ask-aria): query_bank_balance returns clear not-connected message (basiq_connections missing)`

**Acceptance:** Ask Aria "what's my bank balance?" — it should respond honestly that the bank isn't connected and direct the owner to Settings, NOT return empty/wrong data or crash.

---

## FIX 3 — Add `create_roster` and `create_invoice` action types

### 3.1 Check `invoice_items` table exists FIRST

Run this SQL before writing any code:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'invoice_items' ORDER BY ordinal_position;
```

If `invoice_items` does NOT exist, apply this migration first:
```sql
CREATE TABLE invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  total numeric NOT NULL,
  gst_included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON invoice_items USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);
```
If it DOES exist, read its columns and use those — do not create a duplicate.

### 3.2 Add to `ActionType` union in `action-planner.ts`

Add to the `ActionType` union:
```ts
| 'create_roster'
| 'create_invoice'
```

Add to `PLANNER_SYSTEM` prompt (in the SUPPORTED ACTIONS section):
```
create_roster  — draft a weekly roster for one outlet with shift assignments per staff member
create_invoice — create an invoice for a customer with line items, due date, and notes
```

Add to the HARD RULES:
```
7. For create_roster: generate shifts as a JSON array of { staff_id, staff_name, date (YYYY-MM-DD), start_time (HH:MM), end_time (HH:MM), role }. Total hours must not exceed any staff member's max available hours. Set reversible: true.
8. For create_invoice: amounts are in DOLLARS (not cents). GST = 10% on top of subtotal. invoice_number format: INV-{YYYY}-{random 4 digits}. Due date defaults to 30 days from today. Set reversible: true (invoice can be deleted if not yet sent).
```

### 3.3 Add to `executeAction` switch in `action-executor.ts`

**`create_roster` case:**
```ts
case 'create_roster': {
  const { outlet_id, week_start, shifts, total_hours, total_cost_cents, reasoning } = action.payload as {
    outlet_id: string
    week_start: string // YYYY-MM-DD — must be a Monday
    shifts: Array<{ staff_id: string; staff_name: string; date: string; start_time: string; end_time: string; role: string }>
    total_hours: number
    total_cost_cents: number
    reasoning?: string
  }
  
  const { data: roster, error } = await supabase.from('pos_rosters').insert({
    business_id: businessId,
    outlet_id,
    week_start,
    shifts,
    total_hours,
    total_cost_cents,
    published: false, // always draft first — owner publishes
    generated_by_agent: true, // MUST be true for Aria-created rosters
    status: 'draft',
    aria_reasoning: reasoning ?? null,
  }).select('id').single()

  if (error || !roster) return { ok: false, affected_count: 0, error: error?.message ?? 'Failed to create roster', rollback_available: false }
  
  affectedCount = 1
  beforeState = {}
  afterState = { roster_id: roster.id, week_start, shifts_count: shifts.length, total_hours }
  entityIds = [roster.id]
  break
}
```

**`create_invoice` case:**
```ts
case 'create_invoice': {
  const { customer_id, bill_to_name, bill_to_email, bill_to_address, items, notes, due_date_days, send_method } = action.payload as {
    customer_id?: string
    bill_to_name: string
    bill_to_email?: string
    bill_to_address?: string
    items: Array<{ description: string; quantity: number; unit_price: number; gst_included?: boolean }>
    notes?: string
    due_date_days?: number // default 30
    send_method?: 'email' | 'manual'
  }

  // Compute totals deterministically (AI never computes these)
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  const gst_total = Math.round(subtotal * 0.1 * 100) / 100
  const total = Math.round((subtotal + gst_total) * 100) / 100

  const issueDate = new Date().toISOString().split('T')[0]
  const dueDate = new Date(Date.now() + (due_date_days ?? 30) * 86400000).toISOString().split('T')[0]
  const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`

  const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
    business_id: businessId,
    customer_id: customer_id ?? null,
    invoice_number: invoiceNumber,
    status: 'draft',
    bill_to_name,
    bill_to_email: bill_to_email ?? null,
    bill_to_address: bill_to_address ?? null,
    subtotal,
    gst_total,
    total,
    currency: 'AUD',
    notes: notes ?? null,
    issue_date: issueDate,
    due_date: dueDate,
    send_method: send_method ?? 'manual',
    ai_generated: true,
    auto_reminders: false,
  }).select('id').single()

  if (invErr || !invoice) return { ok: false, affected_count: 0, error: invErr?.message ?? 'Failed to create invoice', rollback_available: false }

  // Insert line items — check invoice_items columns match what we dump above
  if (items.length > 0) {
    const lineItems = items.map(item => ({
      invoice_id: invoice.id,
      business_id: businessId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: Math.round(item.quantity * item.unit_price * 100) / 100,
      gst_included: item.gst_included ?? true,
    }))
    await supabase.from('invoice_items').insert(lineItems)
  }

  affectedCount = 1
  beforeState = {}
  afterState = { invoice_id: invoice.id, invoice_number: invoiceNumber, total, status: 'draft' }
  entityIds = [invoice.id]
  break
}
```

### 3.4 Update the action-planner's system prompt context

In `planAction()`, the context summary currently fetches products and staff. Also fetch relevant data for roster/invoice planning:

```ts
const [productsQ, staffQ, customersQ, outletsQ] = await Promise.all([
  // existing queries...
  supabaseAdmin.from('pos_customers')
    .select('id,first_name,last_name,email,phone')
    .eq('business_id', businessId).limit(50),
  supabaseAdmin.from('pos_outlets')
    .select('id,name')
    .eq('business_id', businessId).limit(10),
])
```

Add to `contextSummary`:
```ts
const customers = customersQ.data ?? []
const outlets = outletsQ.data ?? []
// append to contextSummary:
`\nCustomers (sample): ${JSON.stringify(customers.slice(0, 10))}`
`\nOutlets: ${JSON.stringify(outlets)}`
`\nToday's date: ${new Date().toISOString().split('T')[0]}`
`\nCurrent week Monday: ${getMondayOfCurrentWeek()}`
```

Add helper:
```ts
function getMondayOfCurrentWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}
```

### 3.5 Rollback for new actions

In `action-rollback.ts`, add cases for `create_roster` and `create_invoice` that delete the created row (since `reversible: true` and these are drafts):
```ts
case 'create_roster':
  await supabase.from('pos_rosters').delete().eq('id', entityId).eq('business_id', businessId)
  break
case 'create_invoice':
  // Only rollback draft invoices that haven't been sent
  const { data: inv } = await supabase.from('invoices').select('status,sent_at').eq('id', entityId).single()
  if (inv?.status === 'draft' && !inv.sent_at) {
    await supabase.from('invoice_items').delete().eq('invoice_id', entityId)
    await supabase.from('invoices').delete().eq('id', entityId).eq('business_id', businessId)
  }
  break
```

**Commit:** `feat(ask-aria): create_roster + create_invoice action types (pos_rosters + invoices tables)`

**Acceptance:**
- Ask Aria "create a roster for next week with [staff names]" → Aria shows a confirmation plan → user confirms → `pos_rosters` row appears with `generated_by_agent: true`, `status: 'draft'`, `published: false`.
- Ask Aria "create an invoice for [customer] for [items]" → Aria shows plan with AUD amounts + GST → user confirms → `invoices` row appears with `ai_generated: true`, `status: 'draft'`, correct subtotal/gst_total/total.
- Both are reversible (rollback deletes the draft row).
- Neither roster nor invoice is auto-published/sent — always draft first.

---

## WHAT IS NOT IN THIS PROMPT (do not attempt)

- **Full Basiq bank integration** — requires OAuth flow, Basiq account, webhook handling. That's a full sprint, not in scope here. Fix 2 only makes the failure graceful.
- **Publishing rosters to staff** — `pos_rosters.published` stays false until the owner manually publishes in the roster UI. Aria creates drafts only.
- **Sending invoices** — `invoices.status` stays `'draft'`. Aria creates the invoice; the owner sends it from the invoices UI. `send_email_now` for invoice delivery is a follow-up.
- **Deleting any data** — RULE 0 applies to actions too; never add a delete action type.

## ORDER
Fix 1 → Fix 2 → Fix 3 (check invoice_items exists → migration if needed → code). Stop and flag if live schema contradicts anything here.
