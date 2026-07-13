# Sprint S22 — Winback Pro: Sequences + A/B Testing
**Date:** 2026-06-12
**Mode:** SOLO
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npx next build` → PASS
**Commit:** `0ab36986`

---

## Goal
Close two gaps in the Winback feature to reach Klaviyo-level depth:
1. Multi-step SMS sequences (day 0 → day 3 → day 7) with automatic skip for returned customers
2. A/B test tracking (50/50 AI-generated split, per-variant badges in history)
Plus Aria Intelligence wiring: `upsertAriaAction` on sequence creation + `aria_autopilot_actions` for returned-customer events.

---

## Schema changes

### Migration: `supabase/migrations/20260612000001_s22_winback_sequences.sql`
```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_steps jsonb;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS sequence_step integer NOT NULL DEFAULT 0;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS sequence_skip_reason text;
```
- `sequence_steps` — stores the step array (delay_days, message, condition) on the parent campaign
- `sequence_step` — index (0-based) of which step a given `campaign_sends` row belongs to
- `sequence_skip_reason` — why a send was skipped (currently always `customer_returned`)

---

## Files changed

### NEW — `src/app/api/aria/winback-sequence/route.ts`
**GET:** Lists all `winback_sequence` campaigns for a business (auth-checked, uses `supabaseAdmin`).

**POST:** 
- Validates `business_id`, `customer_ids`, `steps[]`
- Inserts campaign record with `type: 'winback_sequence'` and `sequence_steps` JSONB
- Schedules `customer_ids.length × steps.length` rows in `campaign_sends` (each with `sequence_step` index and `scheduled_send_at = now + delay_days * 86400s`)
- Fires `upsertAriaAction` (non-blocking) with sequence creation context

TypeScript note: `sequence_steps` is a new column not yet in `database.types.ts` — insert payload cast with `as any`.

---

### MODIFIED — `src/app/api/aria/winback-send/route.ts`
Existing standard flow fully preserved. Added:

**A/B split path** (triggered by `enable_ab_test: true` in POST body):
1. Calls `claude-haiku-4-5-20251001` to generate variant B SMS (different angle/tone/hook, ≤160 chars)
2. Creates campaign A (`ab_variant: 'A'`) and campaign B (`ab_variant: 'B'`, `ab_parent_id: campA.id`)
3. Splits `customers` array 50/50 — first half → A, second half → B
4. Uses shared `mkSend()` helper for personalised best-hour scheduling (same logic as before)
5. Returns `{ ab_test: true, campaign_a_id, campaign_b_id, variant_a_message, variant_b_message, split_a, split_b, total }`

`customers` and `allSales` are loaded once before the A/B branch — no extra DB calls.

---

### MODIFIED — `src/app/api/cron/send-scheduled-campaigns/route.ts`
**Sequence skip logic (new, before main send loop):**
1. Filters `due` sends where `sequence_step > 0`
2. For each sequence campaign, queries `pos_sales` where `created_at > campaign.created_at` and `customer_id IN (seqCustIds)`
3. Builds a `returnedKeys` set of `campaign_id:customer_id` pairs
4. Any send in `returnedKeys` → pushed to `skippedIds`
5. After processing: `UPDATE campaign_sends SET status='skipped', sequence_skip_reason='customer_returned'` for all `skippedIds`

**Step-specific messages (new, inside main send loop):**
- For `winback_sequence` campaigns with `sequence_step > 0`: reads `sequence_steps[stepIdx].message` instead of the top-level `message`
- Falls back to `campaign.message` if step not found

**Aria Intelligence (new, after processing):**
- After any skipped sends: inserts one `aria_autopilot_actions` row per campaign summarising how many customers returned and had follow-ups cancelled

**`updateRevenue()` function:** unchanged.

---

### MODIFIED — `src/app/dashboard/winback/page.tsx`
All existing tabs and features fully preserved. Added:

**Interfaces:**
- `Campaign` — added `ab_variant: string | null`
- `SequenceStepDraft` — `{ delay_days, message, condition }`
- `SequenceCampaign` — sequence campaign record shape

**State:**
- `sequences: SequenceCampaign[]` — loaded on mount
- `seqSteps: SequenceStepDraft[]` — 3 defaults: day 0 (always), day 3 (if_not_returned), day 7 (if_not_returned)
- `seqLaunching`, `seqResult` — async state for sequence launch
- `enableAB: boolean` — A/B toggle in composer

**Tab type:** `'campaigns' | 'sequences' | 'automations'` (added `sequences`)

**New Sequences tab:**
- 3-step builder cards (Day 0/3/7 labels, condition dropdown, SMS textarea with char counter)
- "Launch Sequence" button — POSTs to `/api/aria/winback-sequence` with selected customers + valid steps
- Success banner showing `customers × steps = sends_scheduled`
- Sequence history list (customers, steps, returned, ROI)

**Composer A/B toggle:**
- `⚡ A/B On` / `A/B Test` button next to channel selector
- When active: passes `enable_ab_test: true` to `/api/aria/winback-send`

**Campaign history:**
- A/B badge inline with campaign name (blue = A, amber = B)
- Shows per-variant stats naturally (each variant is a separate campaign row)

---

## Acceptance criteria

| Check | Status |
|---|---|
| `npx tsc --noEmit` → 0 errors | ✅ |
| `npm run build` → PASS | ✅ |
| Migration file created | ✅ |
| `winback-sequence` GET + POST routes | ✅ |
| Sequences tab in dashboard | ✅ |
| Step builder (3 steps, condition, char counter) | ✅ |
| A/B toggle in composer | ✅ |
| A/B badges in campaign history | ✅ |
| winback-send A/B split with AI variant B | ✅ |
| Cron sequence skip (returned customers) | ✅ |
| Step-specific messages in cron | ✅ |
| aria_autopilot_actions for returned customers | ✅ |
| upsertAriaAction for sequence creation | ✅ |
| RULE 0 (no feature removed or downgraded) | ✅ all existing winback features preserved |
| RULE 5 (protected files untouched) | ✅ |
| RULE 6 (column correctness: pos_customers.segment) | ✅ not accessed in these files |
| RULE 7 (supabaseAdmin for admin reads) | ✅ |
| RULE 8 (claude-haiku-4-5-20251001 for AI variant) | ✅ |

---

## Founder verify checklist

### Sequences tab:
- [ ] Open `/dashboard/winback` → "Sequences" tab appears between Campaigns and Automations
- [ ] Select lapsed customers, fill in step 1/2/3 messages, click "Launch Sequence"
- [ ] Confirm sequence appears in Sequence History (customers × steps counts correct)
- [ ] After a customer makes a purchase, their day-3 and day-7 sends show `status=skipped` in DB

### A/B test:
- [ ] Compose a campaign → click "A/B Test" button (turns amber)
- [ ] Click "Schedule" → API returns `ab_test: true, variant_a_message, variant_b_message`
- [ ] Campaign History shows two rows "(A)" and "(B)" with blue/amber badges
- [ ] Variant B message is different from variant A (AI-generated)

### Aria Intelligence:
- [ ] After sequence creates: `aria_actions` table has a new "Winback sequence created" row
- [ ] After cron processes a skipped send: `aria_autopilot_actions` has a "returned — sequence follow-ups cancelled" row

---

## Push instruction
```
git push origin main
git log origin/main..HEAD   # must be empty
```
