# Prompt 219 — Native Gift Card System


## UI/UX & ANIMATION REQUIREMENTS
Before writing any frontend code, read these skill files in full:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md — apply design tokens, color palettes, font pairings, and component patterns from this skill to every page and component you create or edit
- /mnt/skills/public/frontend-design/SKILL.md — apply production-grade frontend patterns

For any page that involves data visualization, reports, charts, or animated content, also read:
- /mnt/skills/public/remotion/SKILL.md (if it exists) — use Remotion for any video/animation exports or animated report components

Apply these skills silently — do not narrate reading them. Just produce better UI as a result.
Every dashboard page must use the design system from ui-ux-pro-max: correct spacing, typography, color tokens, and component hierarchy. No plain HTML divs with inline styles that ignore the design system.

Read CLAUDE.md in full first. Read every file listed before touching it.
One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY — never remove existing features. Amounts in dollars not cents.
Model: claude-haiku-4-5-20251001 for AI calls.

## EXISTING DB
pos_gift_cards table already exists with these columns:
id, business_id, code, initial_balance, balance, is_active, expires_at,
created_at, recipient_name, issued_at, customer_id, is_flagged, flag_reason, personal_message

NO transactions table exists yet. NO dashboard page exists yet.
NO API routes exist yet. Check with Supabase MCP before creating anything.

## TASK 1 — DB migrations
Commit: "feat(gift-cards): DB migrations — transactions table + gift card settings"

Run via Supabase MCP:

```sql
-- Gift card transactions (every issue/redeem/topup/refund logged here)
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  gift_card_id uuid REFERENCES pos_gift_cards(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('issue','redeem','topup','refund','void','expire')),
  amount numeric NOT NULL, -- positive = credit, negative = debit
  balance_after numeric NOT NULL,
  sale_id uuid REFERENCES pos_sales(id) ON DELETE SET NULL,
  staff_name text,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE gift_card_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_gift_card_txns" ON gift_card_transactions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON gift_card_transactions (business_id, gift_card_id);
CREATE INDEX ON gift_card_transactions (business_id, created_at DESC);

-- Gift card settings per business
CREATE TABLE IF NOT EXISTS gift_card_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean DEFAULT true,
  expiry_months integer DEFAULT 36, -- 3 years default (Australian standard)
  min_load numeric DEFAULT 10,
  max_load numeric DEFAULT 500,
  max_balance numeric DEFAULT 1000,
  allow_topup boolean DEFAULT true,
  allow_partial_redeem boolean DEFAULT true,
  prefix text DEFAULT 'GC', -- code prefix e.g. GC-XXXX-XXXX
  logo_url text,
  brand_color text DEFAULT '#2D5240',
  terms_text text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE gift_card_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_gift_card_settings" ON gift_card_settings
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

Also add missing columns to pos_gift_cards if not present:
```sql
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS redeemed_amount numeric DEFAULT 0;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS void_reason text;
```

## TASK 2 — API routes
Commit: "feat(gift-cards): API routes — CRUD, issue, redeem, topup, void, lookup"

Create these routes:

### GET/POST /api/gift-cards
GET: list all gift cards for business. Query params: status (active/redeemed/expired/voided/all), search (code/recipient), limit, offset.
Returns: { gift_cards: [], total: number, stats: { active_count, total_liability, redeemed_this_month, issued_this_month } }

POST: issue a new gift card.
Body: { initial_balance: number, recipient_name?: string, customer_id?: string, personal_message?: string, expires_at?: string }
- Generate unique code: prefix + 4 random chars + '-' + 4 random chars (e.g. GC-A3F2-9KX1), uppercased
- Check code uniqueness, retry up to 5 times
- Create pos_gift_cards row + gift_card_transactions row (type='issue', amount=initial_balance)
- Return: { gift_card }

### GET /api/gift-cards/[code]
Look up a gift card by code. Used at POS to check balance before redeeming.
Returns: { gift_card: { code, balance, is_active, expires_at, recipient_name } } or 404.
No auth required (used by customer-facing lookup).

### PATCH /api/gift-cards/[id]
Actions: redeem | topup | void | flag
Body: { action: string, amount?: number, sale_id?: string, staff_name?: string, note?: string, void_reason?: string }

redeem: deduct amount from balance, create transaction. Error if insufficient balance or card inactive/expired/voided.
topup: add amount to balance (respect max_balance from settings). Create transaction type='topup'.
void: set is_active=false, voided_at=now(), void_reason. Create transaction type='void'.
flag: set is_flagged=true, flag_reason.

All actions: update balance_after in transaction, update pos_gift_cards.balance + last_used_at.

### GET /api/gift-cards/[id]/transactions
Returns full transaction history for a gift card.

## TASK 3 — Dashboard page
Commit: "feat(gift-cards): dashboard page — issue, lookup, stats, transaction history"

Create: src/app/dashboard/gift-cards/page.tsx

Tabs: Overview | Issue | Lookup | Settings

Design: Aria Financial Trust palette (#2D5240 + #7FB897), white cards, Inter body.

### Overview tab
Stats row (4 cards): Active cards | Total liability ($) | Redeemed this month | Issued this month
Gift cards table: Code | Recipient | Balance | Initial | Status | Issued | Expires | Actions (View / Void)
Status badges: active=green, redeemed=grey, expired=amber, voided=red
Search bar to filter by code or recipient name
Click row → expands to show full transaction history for that card

### Issue tab
Form: Initial balance (number, min $10, max $500) | Recipient name (optional) | Personal message (optional) | Expiry (auto from settings, shown as info) | Customer search (optional link to existing customer)
"Issue gift card" button → POST /api/gift-cards → shows the new card code in a success panel with copy button + print button (opens print dialog with the card design)
Print design: clean card layout with business name, code displayed large, QR code of the code (use a simple qr generation library or just show the code), balance, expiry

### Lookup tab  
Single input: enter a gift card code
"Check balance" button → GET /api/gift-cards/[code]
Shows: card status, current balance, initial balance, expiry, recipient, last used
"Redeem" button: opens amount input → PATCH redeem action
"Top up" button: opens amount input → PATCH topup action (only if settings allow)

### Settings tab
Form matching gift_card_settings columns:
- Expiry (months) — default 36
- Min/max load amount
- Max balance
- Allow top-up toggle
- Allow partial redemption toggle
- Code prefix (shown as prefix-XXXX-XXXX preview)
- Terms text (textarea)
Save button → upsert gift_card_settings

## TASK 4 — POS integration
Commit: "feat(gift-cards): POS terminal — accept gift card as payment method"

Find the POS terminal page (src/app/dashboard/pos/page.tsx or similar).
Read it fully before editing.

Add gift card as a payment method option alongside cash/card:
- "Gift card" button in payment method selector
- Opens code input field
- Auto-lookup balance via GET /api/gift-cards/[code]
- Shows available balance
- If balance >= order total: full redemption, PATCH redeem, mark sale as paid
- If balance < order total: partial redemption, PATCH redeem for card balance, prompt for remaining amount via another method
- Record gift_card_id + gift_card_amount on the sale record (add columns if missing via migration)

## TASK 5 — Sidebar + Aria intelligence
Commit: "feat(gift-cards): sidebar link + Aria business brain context"

1. Add to src/components/dashboard/Sidebar.tsx ALL_ITEMS:
'gift-cards': { href: '/dashboard/gift-cards', label: 'Gift cards', icon: CreditCardIcon, section: 'Revenue' }
Add to retail, cafe, restaurant industry configs in src/lib/industry-config.ts.

2. In buildAskAriaContext: add gift card summary:
- Total active cards + liability
- Cards expiring in next 30 days (reminder to notify customers)
- Revenue from gift card redemptions this month
Format: "Gift cards: ${active_count} active, ${liability} outstanding liability. ${expiring_soon} expiring in 30 days."

## COMPLETION CHECKLIST
- [ ] Both new tables created with RLS
- [ ] pos_gift_cards new columns added
- [ ] All 4 API routes working
- [ ] Dashboard page: all 4 tabs functional
- [ ] Issue flow: code generated + copy + print
- [ ] Lookup flow: balance check + redeem + topup
- [ ] POS: gift card accepted as payment method
- [ ] Sidebar link present
- [ ] Aria context updated
- [ ] npx tsc --noEmit passes
- [ ] npm run build passes
State "Build verified green, all commits pushed." when done.
