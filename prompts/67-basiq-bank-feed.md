# Prompt 67 — Basiq Bank Feed: Real Cash Balance in Ask Aria

## What this unlocks
Owner asks: "What's my actual bank balance right now?" or "How much cash do I have?"
Basiq connects to ALL Australian banks (ANZ, CommBank, NAB, Westpac, ING etc) via CDR.
Basiq is an accredited Australian fintech — no need for us to become a CDR participant.
No Tyro-style partnership needed — just sign up at basiq.io and get API keys.

## Why Basiq not direct bank APIs
Banks require ACCC accreditation to access Open Banking (CDR) data directly.
Basiq IS accredited — they handle the bank connection, we just use their API.
Cost: Basiq free tier covers 100 connections — enough for launch.

## Pre-edit checklist (MANDATORY)
1. `cat src/app/dashboard/integrations/page.tsx` — full read
2. Check DB: `businesses` table — any basiq/bank columns?
3. Check: `cash_flow` page — `src/app/dashboard/cash-flow/page.tsx` — this is where bank data should surface

## What to build

### 1. DB migration
```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS basiq_user_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS basiq_connected boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS basiq_connected_at timestamptz;
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  basiq_account_id text,
  account_name text,
  account_type text, -- transaction, savings, credit
  institution_name text, -- ANZ, CommBank etc
  balance numeric,
  available_balance numeric,
  currency text DEFAULT 'AUD',
  last_synced_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  account_id uuid REFERENCES bank_accounts(id),
  basiq_transaction_id text UNIQUE,
  description text,
  amount numeric, -- negative = debit, positive = credit
  balance numeric,
  transaction_date date,
  category text,
  created_at timestamptz DEFAULT now()
);
```

### 2. Basiq connection flow
Basiq uses a consent-based flow — owner connects their bank through Basiq's hosted UI.

`src/app/api/integrations/basiq/connect/route.ts` — POST
- Create Basiq user: `POST https://au-api.basiq.io/users` with owner email
- Create consent link: `POST https://au-api.basiq.io/users/{userId}/auth_link`
- Returns consent URL — owner clicks to connect bank via Basiq hosted UI
- Store basiq_user_id in businesses table

`src/app/api/integrations/basiq/callback/route.ts` — GET
- After owner connects bank, Basiq calls this webhook
- Fetch accounts: `GET https://au-api.basiq.io/users/{userId}/accounts`
- Store accounts in bank_accounts table
- Set basiq_connected = true

`src/app/api/integrations/basiq/disconnect/route.ts` — POST
- Delete Basiq user: `DELETE https://au-api.basiq.io/users/{userId}`
- Clear bank_accounts for business

### 3. Data sync route
`src/app/api/integrations/basiq/sync/route.ts` — GET
Fetch from Basiq:
- Accounts: balance, available balance per account
- Transactions: last 90 days

```ts
// Get accounts
GET https://au-api.basiq.io/users/{userId}/accounts
// Get transactions
GET https://au-api.basiq.io/users/{userId}/transactions?filter=transaction.postDate.gte(90daysago)
```

Auth: `Authorization: Bearer {BASIQ_API_KEY}`

Store in bank_accounts + bank_transactions.
Cache: sync every 4 hours max (Basiq rate limits).

### 4. Ask Aria tool
Add `query_bank_balance` to aria-tools.ts:
```ts
{
  name: 'query_bank_balance',
  description: 'Get real bank account balances and recent transactions. Use when owner asks about cash balance, bank account, money available, or recent large transactions.',
  input_schema: {
    type: 'object',
    properties: {
      metric: { type: 'string', enum: ['balance', 'transactions', 'summary', 'cashflow'] }
    }
  }
}
```

Returns: total balance across all accounts, biggest account balance, last 5 transactions, income vs expenses this month.

Aria uses for:
- "What's my bank balance?" → total balance
- "Do I have enough to pay rent this week?" → balance + upcoming expenses
- "Where is my money going?" → top expense categories from transactions

### 5. Cash flow page integration
In `src/app/dashboard/cash-flow/page.tsx`:
If bank connected: show real account balances at top instead of just projected.
Show: account name + bank logo + current balance + last synced time.
"Refresh" button triggers sync.

### 6. Integrations page card
- "Bank Accounts" section with Australian bank logos
- Connected: shows each account + balance (masked: "ANZ •••• 4521 — $12,430")
- Not connected: "Connect your bank" → triggers Basiq consent flow
- Privacy note: "Read-only access. Aria can see balances but never move money."

### 7. Daily briefing integration
If bank connected: include cash balance in daily briefing context.
Council gets: "Current bank balance: $12,430. Last week outflows: $3,200."
Aria can then say: "You have $12,430 in the bank. With $3,200 in typical weekly expenses, you have about 4 weeks of runway."

### 8. Env vars needed (sign up at basiq.io — free tier available)
- `BASIQ_API_KEY` — from Basiq dashboard
- `BASIQ_ENVIRONMENT` — sandbox or production

## IMPORTANT — Privacy messaging
Bank data is extremely sensitive. Show clearly in UI:
- "Read-only access — Aria can never move money"
- "Bank data is encrypted and never shared"
- "Disconnect anytime from settings"

## Execution order
1. Sign up at basiq.io — get free API key (sandbox first)
2. Run DB migrations via Supabase MCP
3. Build connect/callback/disconnect routes
4. Build sync route
5. Add query_bank_balance tool to aria-tools.ts
6. Add bank section to cash-flow page
7. Add card to integrations page
8. Wire bank context into daily briefing
9. `npx tsc --noEmit` + `npm run build` → must pass
10. Single commit: "feat: Basiq bank feed — connect Australian banks, real balance in Ask Aria and briefing"
