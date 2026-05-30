---
name: Aria OS Coding Rules
description: Project-specific coding rules for aria-saas-audit. Enforces JSX style constraints, DB column names, model IDs, vercel.json limits, and protected files. MUST be applied on every UI/TSX task.
---

# Aria OS Coding Rules

## RULE 1: Write files cleanly
Never write TSX/TS as escaped strings. Rewrite full files cleanly — no regex transforms on code.

## RULE 2: JSX Template Literals — ZERO TOLERANCE
NEVER inside `style={{ }}`:
  ❌ style={{ background: `rgba(${val},0.1)` }}
  ❌ style={{ border: `1px solid ${color}` }}
  ❌ style={{ width: `${pct}%` }}

ALWAYS use concatenation:
  ✅ style={{ background: 'rgba(' + val + ',0.1)' }}
  ✅ style={{ border: '1px solid ' + color }}
  ✅ style={{ width: pct + '%' }}

Template literals ARE fine in:
  ✅ value={`$${amount}`}         — inside {} expression
  ✅ className={`text-${size}`}   — inside {} expression
  ✅ const url = `/api/${id}`     — plain JS, not JSX prop

## RULE 3: 'use client' must be line 1
  ✅ 'use client'
     import React from 'react'
  ❌ import React from 'react'
     'use client'

## RULE 4: JSX structural rules
- Every JSX return must have a single root element
- Components injected into JSX must be INSIDE the root element
- Never inject a component after the closing root </div>
- Helper components declared BEFORE the default export, not after

## RULE 5: String building in JS
- URL construction: '/api/x?id=' + id + (cond ? '&y=1' : '')
- Never mix template literals and concatenation in one expression

## RULE 6: DB column names (verified against schema)
- pos_sale_payments: method, amount_cents (NOT payment_method, amount)
- pos_sales: status != 'voided', served_by is TEXT not UUID
- pos_customers: last_visit_at, total_spend, loyalty_points
- pos_products: track_inventory, stock_quantity, reorder_point, reorder_qty
- aria_ai_calls role CHECK: generator|judge|search|data|forecast|chat|classify|
  analysis|embed|narrative|reorder|rostering|competitor|social|briefing|
  generate_image|image|document|pricing|product|customer|inventory|
  schedule|compliance|other

## RULE 7: vercel.json
- Max 22 functions
- Crons: daily max, never sub-daily
- NEVER add nodeVersion field (invalid, blocks all deploys)
- maxDuration: 300 for crons, 120 for AI routes, 60 default

## RULE 8: Model IDs (exact strings)
- claude-haiku-4-5-20251001
- claude-sonnet-4-5-20250929
- claude-opus-4-5-20251101

## RULE 9: Never touch these files
- src/components/ui/AnimatedBg.tsx
- src/components/ui/FlyToCart.tsx
- src/components/ui/CursorGlow.tsx
- src/lib/pos-sfx.ts
- src/lib/aria-voice-guide.ts

## RULE 10: Amounts are dollars, never cents
- pos_sales.total_amount is DOLLARS (numeric)
- pos_sale_payments.amount_cents is CENTS (integer)
- Never store cents in total_amount