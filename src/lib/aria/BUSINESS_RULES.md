# Aria Business Rules Engine

`src/lib/aria/business-rules.ts` — pure validation layer. Every AI suggestion route
must call `validatePromoSuggestion` AFTER receiving the LLM response and BEFORE
returning to the client.

## Why this exists

In testing, `/api/aria/promo-suggest` returned "Buy 1 Get 1 St Agnes Rum" on a
$50 sell / $40 cost premium spirit with 47 units in stock. The BOGO would:
- Lose $30 per redemption (cost $40 × 1 free unit, margin only $10)
- Violate AU Liquor Act / RSA (BOGO = rapid-consumption promotion on alcohol)
- 47 units @ 4/wk = ~12 weeks of stock — normal, not overstock

The AI saw "47 units" and pattern-matched "overstock → BOGO" without ever
computing margin, velocity, or RSA compliance.

## The 6 hard rules

| # | Rule | Enforced by |
|---|------|-------------|
| 1 | Profit ≥ $0.50 per redemption | `MIN_PROFIT_PER_REDEMPTION_CENTS = 50` |
| 2 | No BOGO on products > $25 | `PREMIUM_PRICE_THRESHOLD_CENTS = 2500` |
| 3 | Discount % ≤ half margin % | `maxAllowedDiscount = floor(marginPct / 2)` |
| 4 | Alcohol: no BOGO / happy_hour | RSA check on `age_restricted && alcohol_percentage > 0` |
| 5 | Stock count ≠ overstock | Velocity check: only flag when `weeks_of_stock > 12` |
| 6 | Always try to rewrite | `rewriteToSaferAlternative()` before hard-reject |

## Key test cases

### Case 1: BOGO on $50 rum (20% margin) — REJECTED
```
validatePromoSuggestion(
  { type: 'bogo', paid_qty: 1, free_qty: 1, rationale: '...' },
  { product_id: 'x', name: 'St Agnes Rum', price: 50, cost_price: 40,
    stock_quantity: 47, age_restricted: true, alcohol_percentage: 40 }
)
// → ok: false, rejected_reason: "BOGO...loses $30 per redemption"
// → rewritten: { type: 'tiered', discount_percent: 5 }
```

### Case 2: BOGO on cheap wine — REJECTED (RSA even with healthy margin)
```
validatePromoSuggestion(
  { type: 'bogo', paid_qty: 1, free_qty: 1, rationale: '...' },
  { product_id: 'x', name: 'Cheap Wine', price: 15, cost_price: 5,
    stock_quantity: 100, age_restricted: true, alcohol_percentage: 12 }
)
// → ok: false (RSA rule), rewritten: percent_off 10%
```

### Case 3: 5% off on healthy-margin retail — ALLOWED
```
validatePromoSuggestion(
  { type: 'percent_off', discount_percent: 5, rationale: '...' },
  { product_id: 'x', name: 'Chips', price: 4, cost_price: 1.5, stock_quantity: 200 }
)
// → ok: true (margin 62.5%, 5% off = $0.37.5 discount, still $0.225 profit)
```

### Case 4: 50% off on 40% margin product — REJECTED, capped to 20%
```
validatePromoSuggestion(
  { type: 'percent_off', discount_percent: 50, rationale: '...' },
  { product_id: 'x', name: 'X', price: 10, cost_price: 6, stock_quantity: 50 }
)
// → ok: false, rewritten.discount_percent = 20 (half of 40% margin)
```

## Modifying the rules

Change constants at the top of `business-rules.ts`. Any relaxation must be
reviewed against AU consumer law (ACCC fair-trading) and industry-specific
regulations (Liquor Act, Food Standards Code for allergens, etc.).

**Do not delete or weaken these rules without a clear business justification
documented in the PR.**
