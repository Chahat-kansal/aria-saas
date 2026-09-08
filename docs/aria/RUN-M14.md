# RUN-M14 · SURCHARGE BAN — 1 OCTOBER

7 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — GATE

### ✅ M13 is pushed and both walls are live

`.github/workflows/canon-rail-guard.yml` runs on every push, and the guard carries all three rules
this sprint depends on: `model-call-outside-gateway`, `supabase-error-not-read`,
`supabase-write-result-discarded`. Working tree clean, nothing unpushed. **The gate passes**, so
this sprint may proceed — and it must add neither a 172nd direct model caller nor a silent price
write.

---

## ⚠️ THE REGULATORY PREMISE — VERIFIED AGAINST THE RBA, AND CORRECTED

The paste says to verify rather than take its word. I did. **The numbers are exactly right. The
legal mechanism is not, and it changes what Aria is allowed to tell an owner.**

### The numbers — all confirmed

| | RBA Conclusions Paper, March 2026 |
|---|---|
| domestic debit & prepaid | cap **8 cents or 0.16%** ad valorem; benchmark 8c (was 10c / 0.2%) |
| domestic consumer credit | cap **0.3%**; weighted-average benchmark **abolished** (was 0.8% cap / 0.5% benchmark) |
| foreign-issued cards acquired in Australia | cap **1.0%**, uniform (previously unregulated) |
| effective | most changes **1 October 2026**; transparency and foreign-card items **1 April 2027** |

### ⚠️ CORRECTION 1 — the RBA does not ban merchants from surcharging

The paste says *"every Australian merchant loses the ability to surcharge card payments"* and
*"surcharging ends 1 Oct 2026"*. What the RBA actually decided:

> "**lift the prohibition on 'no-surcharge' rules** for all currently designated card networks
> (eftpos, Mastercard and Visa)… Based on historical experience and arrangements in other
> jurisdictions, the RBA considers that this will **likely be followed by the designated card
> networks imposing 'no-surcharge' rules**."

And, explicitly: *"If surcharging continues after the prohibition on no-surcharge rules is lifted,
the RBA **could recommend that the Government legislate a ban** on surcharging."*

**So the RBA removes its own regulatory barrier; the card schemes are then expected to forbid
surcharging through their rules.** The practical effect for a café is the same — Visa, Mastercard
and eftpos will not permit it — but the mechanism is a **scheme rule, not a law**.

**This matters for every owner-facing sentence this sprint writes.** Aria must not tell a merchant
"surcharging becomes illegal on 1 October". It becomes prohibited by the card networks' rules. One
of those statements is true and the other is legal advice that is wrong.

### ⚠️ CORRECTION 2 — "acquirers instructed to remove surcharging functionality" is unverified

The paste lists this as a regulatory fact. **I could not find it** in the media release, the
executive summary or the interchange chapter. It may be true and stated elsewhere, but **nothing in
this sprint may assert it**, and no owner-facing copy will.

### ⚠️ ADDITION — the paste omits commercial credit, and a café takes business cards

Domestic **commercial** credit keeps its **0.8%** cap; only its benchmark is abolished. So the
"cost falls" story is not uniform: a venue with a high share of business cards gains far less than
one on consumer debit. Any blended-rate model that ignores this will overstate the saving.

---

## PREFLIGHT — WHAT ALREADY EXISTS

**The rule is "extend it, never a second pricing engine". Most of this sprint's machinery is
already here.**

| need | what exists | verdict |
|---|---|---|
| provenance tiers | `Grounding = 'verified' \| 'derived' \| 'estimated'` (`aria/compute/provenance.ts`) | **reuse** — do not invent a fourth vocabulary |
| per-product cost with provenance | `resolveCostBatch()` / `resolveCostFor()`, `CostSource` = outlet ⟩ last_delivery ⟩ purchase_order ⟩ catalogue ⟩ unknown, plus `COST_SOURCE_LABEL` and `summariseCostQuality()` | **reuse** |
| detecting a fabricated cost | **`looksBackCalculatedCost(price, costPrice)` already exists** | **reuse** |
| the price write | **`bulk_price_update`** — a registered capability, `propose_only`, gate reason `money`, in `DESTRUCTIVE_ACTION_TYPES`, with a working `executeAction` branch, kill switch, role gate, mass-mutation backstop and append-only audit | **reuse. This is the only way a price may change.** |
| surcharge config | `pos_settings` (7 columns) + `pos_surcharge_rules` (13 columns) | exists |

### ⚠️ CORRECTION 3 — "0 of 74 products have a recorded cost" is wrong, and the truth is worse

**72 of 74 active products have a `cost_price`.** But:

```
active products with a cost                     72
of those, exactly price × 0.4                   72
not matching the 0.4 pattern                     0
average cost as a share of price              40.0%
```

**Every single one is the fabricated back-calculation CLAUDE.md warns about.** That is more
dangerous than having none, because a naive margin calculation would produce confident,
plausible-looking numbers from all 72. The brief's *conclusion* — that margin is `not-connected` —
is right; its *number* is wrong; and the repo already has `looksBackCalculatedCost()` to catch
exactly this. **Phase 2 will use the resolver, not the column.**

### What Sip's data can and cannot support

| | measured |
|---|---|
| completed sales | **1,802** · revenue **$34,248.87** |
| sales carrying payment rows | **54 (3.0%)** |
| payment methods recorded, ever | `card`, `cash`, `other` — **no debit / credit / foreign split exists in the schema** |
| card share of value, from those 54 | 88.2% |
| settlement / acquirer / interchange tables | **0** |
| active products · average price | 74 · **$8.07** |

**⚠️ Sip does not surcharge today.** `surcharge_enabled = false`, `card_surcharge_percent = 0.00`,
`surcharge_value = 0.00`. So for this venue 1 October removes nothing — **its card costs simply
fall.** That is the opposite of the sprint's framing and it is the honest answer for any
non-surcharging venue, which will be many cafés.

**Least-cost routing is not visible to Aria at all** — no acquirer integration, no settlement table.
That is `not-connected`, and phase 1 will say so rather than assume.

### ⚠️ A second price source exists, latent — the N-copies pattern in the money path

`pos_price_list_items.override_price` (`src/app/api/pos/price-lists/route.ts:33`) overrides
`pos_products.price`. **`pos_price_lists`: 0 rows. `pos_price_list_items`: 0 rows** — across every
business, not just Sip. So today `pos_products.price` **is** the single source of truth, and the
second one is dormant rather than drifting. Recorded here with file and line because it is one
populated row away from being a real fork in the price path.

---

## PHASE 1 — WHAT DOES THIS VENUE ACTUALLY PAY? ✅

**Commit:** `<phase-1>` · `aria/compute/card-cost.ts` (new), `card-cost.test.ts` (new, 15 tests),
`api/pricing/card-cost/route.ts` (new), `dashboard/surcharge-ban/page.tsx` (new).

Built **inside** the existing compute module: `ComputeResult<T>`, `Provenance`, `makeProvenance` and
the `Grounding` union are all reused. `CardCostTier = Grounding | 'stated' | 'not_connected'` —
**extended, not forked**, because a fourth vocabulary for the same idea is how N-copies drift starts.

### ⚠️ THE CORRECTION THAT MATTERS MOST, AND IT IS IN NEITHER THE BRIEF NOR THE INDEX

**An interchange cap is not what a merchant pays.** Interchange is the issuer's slice. What the café
actually pays is a **merchant service fee**: interchange **plus scheme fees plus the acquirer's
margin**. Telling an owner "your card cost is now 0.3%" would be wrong by a factor that varies by
acquirer — and it is precisely the mistake that produces a badly-priced menu, which is the thing
this sprint exists to prevent.

So the engine computes what it honestly can — **how far the interchange component falls** — and
**refuses to present that as the merchant's cost**. `merchant_service_fee_pct` is `null` and
`merchant_service_fee_tier` is `not_connected` on **every** path, mix known or not, and a test pins
that both ways.

### ⚠️ Ticket size changes the debit cap, and modelling it flat overstates a café

Debit is capped at "8c **or** 0.16%", whichever binds. On a $4 coffee 8c is 2%, so the 0.16% cap
binds; on a $100 tab 0.16% is 16c, so the 8c cap binds. A model that used a flat 0.16% would
overstate the cost of a café's typical basket. `blendedInterchangePct` takes the average transaction
value and uses the **lower** of the two, and when it is unknown it says so rather than guessing.

### The honest answer when the mix is unknown: a range, never a rate

`pos_sale_payments.method` is `card | cash | other`. **There is no debit/credit/foreign split in the
schema and no settlement table in the database**, so a blended rate cannot be computed. The engine
returns the **span between two real caps** instead — all-debit at one end, all-business-credit at
the other — tier `not_connected`, and names the reason in words.

### RENDERED FOR SIP, from its real recorded numbers

```
surcharge_today_pct   0      [verified]      ← "we don't surcharge" is a read setting, not an assumption
card_share_pct        88.2   [estimated]
interchange_after     null   [not_connected]
range low             0.16%  (if every card were debit)
range high            0.80%  (if every card were a business credit card)
merchant_service_fee  null   [not_connected]
least_cost_routing    not_connected
action_required       false
provenance.grounding  estimated

UNKNOWNS (4):
  1. Card share is measured from 54 of 1802 sales (3% of them), because the rest carry no payment record.
  2. Your POS records a payment as "card" without saying debit, credit or overseas, so we cannot
     blend your actual rate — only the range it must fall inside.
  3. Interchange is only part of what you pay. Your merchant service fee also includes scheme fees
     and your acquirer's margin, which we cannot see without your settlement statements — so we
     cannot tell you how much of the interchange cut reaches you.
  4. Least-cost routing is set by your acquirer and is not visible to Aria.
```

**Sip's headline is the opposite of the sprint's framing, and it is the truthful one:** *"You do not
add a card fee today, so nothing is taken away from you on 1 October. What changes is that the
interchange caps fall — the wholesale part of your card cost gets cheaper."*

### The screen

`/dashboard/surcharge-ban` — the deadline in the RBA's own mechanism wording, what it means for this
venue, the interchange before/after (or the range), the four cap lines including **business credit
unchanged at 0.8%**, and a **"What we cannot see" panel that is neither collapsible nor below the
fold.** Phase 6 extends this same screen with the proposal and the approve button; there is one
screen for this deadline, not two.

### The rails — 15 tests, every one calling the engine

The caps asserted against the RBA's published figures · **the mechanism sentence may never contain
"illegal", "unlawful", "banned by law" or "against the law"** · the debit cap tested at $4 and $100
and asserted never to exceed 0.16% at any ticket · a mix that does not sum to 1 rejected as a broken
feed rather than treated as zero · the unknowns list shrinks as inputs improve but **never below the
two that POS data can never answer**.

**MUTATION:** assuming 1.5% — the decision table's named failure — is reproduced and shown to be a
different answer from what the engine returns.

### ⚠️ NOT VERIFIED: the route and the page were not exercised in a browser

There is no dev server and no authenticated session available to this run, so
`GET /api/pricing/card-cost` and `/dashboard/surcharge-ban` are **compiled and typechecked, not
rendered**. What IS observed is the engine's real output on Sip's real recorded inputs, printed
above. **A human must open the page while signed in as Sip to confirm the render**; phase 6 lists
that alongside the approval steps.

---

## PHASE 2 — THE MARGIN HIT, PER ITEM ✅

**Commit:** `<phase-2>` · `aria/compute/item-card-impact.ts` (new), `item-card-impact.test.ts`
(new, 15 tests), `api/pricing/item-impact/route.ts` (new).

### ⚠️ THE INSIGHT THAT MAKES THIS WORK WITHOUT ANY COST DATA

A venue that surcharges is about to stop collecting it. The revenue it loses is

```
surcharge rate × share of takings on card
```

**and the price rise that recovers it exactly is the same figure.** A 1.5% surcharge where 88% of
takings are on card is a 1.32% hole, and a 1.32% rise fills it.

**None of that needs a cost price.** It is arithmetic over the venue's own settings and its own
sales. So the single most useful number in this sprint is fully grounded even though Sip's cost data
is worthless — **the opposite of what the brief assumed, and much better news.**

What genuinely does need a cost is *"what share of this item's margin does the card cost eat"*, and
that is `not_connected` here rather than guessed.

### The per-item table, rendered from Sip's real prices and real 90-day units

```
SIP AS RECORDED (surcharge_enabled = false → 0%)
  recovery_pct 0% [estimated] · total_surcharge_lost 0 · cost_quality {total:8, usable:0, back_calculated:8, missing:0}
  Avocado Toast       $16.00  units 3  rev $48.00  → $16.00   margin null [not_connected]
  Bacon and Egg Roll  $12.00  units 2  rev $24.00  → $12.00   margin null [not_connected]
  Affogato            $ 7.00  units 3  rev $21.00  → $ 7.00   margin null [not_connected]
  Chicken Wrap        $14.00  units 1  rev $14.00  → $14.00   margin null [not_connected]
  Apple Juice         $ 6.00  units 2  rev $12.00  → $ 6.00   margin null [not_connected]
  Banana Bread Slice  $ 7.00  units 1  rev $ 7.00  → $ 7.00   margin null [not_connected]
  Brownie             $ 6.00  units 1  rev $ 6.00  → $ 6.00   margin null [not_connected]
  Chai Tea            $ 4.50  units 1  rev $ 4.50  → $ 4.50   margin null [not_connected]
  UNKNOWNS: 8 of 8 products have a cost that is exactly 40% of the price — the signature of a
  number that was derived from the price rather than recorded. We will not compute a margin from those.
```

**Sip's prices do not move, because Sip loses nothing.** That is the correct output, not an empty one.

The same engine on a venue that *does* surcharge at 1.5% — **a worked example, not Sip's data** —
returns `recovery_pct 1.323%` and moves Avocado Toast $16.00 → **$16.21**, Chai Tea $4.50 →
**$4.56**. Every margin still `null [not_connected]`, because the cost problem is unchanged.

### ⚠️ The mutation, and why it is the finding

A naive engine reads `cost_price` and computes the margin. On Sip's two heaviest sellers that gives
**Avocado Toast $3.00** and **Toastie $7.50** — confident, precise, and fabricated, because all 72
costs are exactly `price × 0.4`. The engine returns **`null`** for both.

```
naive   [{ Flat White, margin: 3 }, { Toastie, margin: 7.5 }]
honest  [{ Flat White, margin: null }, { Toastie, margin: null }]
```

Two confident numbers against two honest nulls, asserted as unequal. **The grounding rail goes red
on exactly the invented cost the sprint named.**

### The rail is not simply always-null

`isCostUsableForMargin()` is tested in both directions: an **outlet-recorded** cost produces a real
margin (`Beans 1kg $30 − $18 = $12`, tier `verified`), and a catalogue cost that does *not* match the
signature (41.7%, the case `resolve-cost.ts` documents) is accepted as a genuine estimate. Only the
`catalogue` + `price × 0.4` combination is rejected — a weak tier alone is not disqualifying, and a
suspicious ratio alone is not either.

### Honest on thin data, which is the sprint's own test

An item with **no sales line** in the window returns `revenue: null` / `not_connected` — but its
**recovering price is still computed**, because that needs no sales. An item with **zero units** is
`revenue: 0` / `verified`, because zero is a real answer. Returns are netted off units, so a
refunded coffee does not inflate the item.

**Gates:** tsc 0 · vitest **15/15** on this file · canon rail pass.

---

## PHASE 3 — PROPOSE, DON'T PRICE ✅

**Commit:** `<phase-3>` · `aria/compute/surcharge-policy.ts` (new), `surcharge-policy.test.ts`
(new, 18 tests), `api/pricing/surcharge-proposal/route.ts` (new).

### It goes through both gateways, and adds no new power

**The action gateway:** the proposal is **one row** in `aria_autopilot_actions`, written through
`createDecision` — the canonical propose path — carrying `action_type: 'bulk_price_update'`,
`domain: 'money'`, `status: 'pending'`. That capability was already `propose_only` with gate reason
`money`, already in `DESTRUCTIVE_ACTION_TYPES`, and already had a kill switch, a role gate, a
mass-mutation backstop and an append-only audit log. **No second pricing engine and no new
capability.**

**The model gateway:** the reasoning sentence comes from `callModel` — M13's one door. A direct
Anthropic call here would fail the canon rail, and that would be correct. Its system prompt carries
the phase-0 correction verbatim: *never say surcharging becomes illegal*, and *do not invent any
number*.

### VERIFIED AGAINST PRODUCTION — the row lands, and no price moves

Rolled-back `DO` block writing the exact row the route writes:

```
[decision row = ACCEPTED]  status=pending  domain=money  stepup=true
                           action_type=bulk_price_update  lines=1
| pos_products unchanged: avg=8.07
```

**Accepted, pending, and the menu is untouched.** `aria_autopilot_actions` has CHECKs on `domain`,
`status` and `priority` only — `kind` and `action_type` are unconstrained, so
`surcharge_ban_reprice` is safe. Checked before writing, not after.

### ⚠️ Rounding is a proposal feature, and the drift is the proof

A 1.32% rise turns $4.50 into $4.5594. Nobody prices a chai at $4.5594, so it must be rounded — and
rounding always over- or under-recovers. **Every line carries its drift:**

```
Chai Tea       target $4.56  →  proposed $4.60   drift +$0.04   (recovers MORE than needed)
Avocado Toast  target $16.21 →  proposed $16.20  drift −$0.01   (recovers LESS)
                                        net rounding drift +$0.03
```

The owner sees the rounding rather than inheriting it. `exact` is offered and leaves zero drift — a
legitimate choice, not a missing feature.

### The three policies, on the owner's own item

`policyComparison()` deliberately takes a real menu item rather than an invented $5.00 coffee. On a
$4.50 chai at a 1.32% shortfall:

| policy | applied | new price | absorbed per sale |
|---|---|---|---|
| recover fully | 1.32% | **$4.60** | −$0.01 (over-recovers, after rounding) |
| recover half | 0.66% | $4.50 | $0.03 |
| absorb | 0% | $4.50 | $0.06 |

**`absorb` changes no price, so there is nothing to approve** — and the route creates no decision row
at all in that case, rather than leaving an empty one for the owner to dismiss.

### The step-up is demanded on amount OR on breadth

`requires_stepup` when the annualised effect reaches **$1,000** — in either direction, because a
price cut is a money decision too — **or** when **20 or more** prices move at once. *A small rise
across the whole menu is not a small change.* Both thresholds are named constants and both edges are
tested. A proposal that changes nothing never asks for one.

### Annualising says which window it used

A 90-day window scales by **365/90**, not by 4: `$5.00 → $5.10 × 100 units × 4.06 = $40.56`. An item
with unknown units contributes `null` and the total **ignores it rather than guessing**; when every
item is unknown the total is `null`, never `0`.

### MUTATION — an engine that priced in place

`buildPricingProposal` is pure, and the test asserts the input items' prices are **unchanged** after
it runs. The mutant — applying the rise to the item itself, which is the decision table's *"Never
automatically"* — produces different state, asserted unequal.

**And the load-bearing assertion is behavioural, not structural:** `isAutoRunnable(findCapability(
'bulk_price_update'))` is called and must be `false`. That is what actually stops a plan runner
carrying the price change out by itself.

---

## PHASE 4 — PUSH TO WHERE PRICES LIVE ✅

**Commit:** `<phase-4>` · `ask/action-executor.ts`, `aria/compute/surcharge-policy.ts`,
`surcharge-policy.test.ts` (+7 tests, 25 total).

### ⚠️ THE EXECUTOR WOULD HAVE THROWN AWAY EVERY PRICE THE OWNER APPROVED

`bulk_price_update`'s branch could only apply **one percentage across a filtered set** — category or
brand, one `price_change_value`, no per-item prices. The whole point of phase 3's proposal is
per-item **rounded** prices: $4.50 → **$4.60**, $16.00 → **$16.20**. Approving it would have applied
a flat 1.32% and written **$4.5594**.

**The owner would have approved one set of numbers and got another.** Found by tracing the payload
into the branch rather than assuming it fit.

**Fixed, additively:** the branch now accepts an optional `lines: [{ product_id, to }]`. When
present it targets exactly those ids and writes exactly those prices; when absent **every existing
caller behaves precisely as before**. The mass-mutation backstop, the before-state capture, the
per-row error check and the rollback all apply identically. **This changes which prices are written,
never who may write them.**

A product **not** in the approved list is **skipped**, never repriced by the leftover percentage —
and a `0`, negative or non-numeric price is refused rather than written, because a $0 shelf price is
the most damaging thing a price writer can do.

`explicitPriceFor()` is **one definition shared by the proposal that writes the lines and the
executor that reads them**, so the two cannot drift.

### ONE SOURCE OF TRUTH — proven by observation, not asserted

A single `UPDATE` on `pos_products`, rolled back, read through each surface's own query shape:

```
BEFORE  pos_products=4.50 | public-menu-shape=4.50 | pos-terminal-shape=4.50
AFTER   pos_products=4.60 | public-menu-shape=4.60 | pos-terminal-shape=4.60
        | price-list override = none exists
```

Every price surface — `menu/[slug]`, `menu/[slug]/[menu_key]`, `pos/(fullscreen)/menu`,
`api/public/menu/[business_id]`, `api/pos/products/*`, the in-store chat and recipe routes — reads
`from('pos_products')`. **There is no cache and no second display copy**, so an approved change
appears everywhere by construction.

**No ESL or menu-board integration exists** to push to. Searched; nothing matched beyond unrelated
words.

### ⚠️ SIX OTHER TABLES CARRY A PER-PRODUCT PRICE COLUMN — the N-copies pattern, measured

| table | rows | read by | verdict |
|---|---|---|---|
| **`pos_product_prices`** | **2** (both Sip's, both `0.00`, qty 1) | `pos/products/[id]/edit`, `lib/products/queries.ts` | **a real second table.** Quantity/outlet-tiered pricing. Not read by any customer surface, but a reprice leaves these rows stale. |
| `pos_price_list_items` | 0 | `api/pos/price-lists`, `dashboard/promotions` | dormant |
| `pos_price_points` · `pos_product_variants` · `pos_item_variations` · `marketplace_listings` | 0 each | — | dormant |
| `booking_services` | 1 | bookings | a different product concept, not a menu item |

**Parked, with the reason:** reconciling tiered/variant pricing with the base price is a pricing-model
sprint, not this one. Today only `pos_products.price` reaches a customer, and that is what the
proposal writes.

### ⚠️ AND A LIVE DEFECT FOUND ON THE WAY — PARKED, out of scope

`src/app/api/pos/price-lists/route.ts:33` selects **`override_price`**, a column that **does not
exist** — the live table's column is `price`. The route's own POST handler documents this at line
80 and maps it correctly on the way in; **the CSV export read was never fixed.** So that query
errors, its error is discarded, and the export returns **a header row and nothing else**, silently.
`.order('created_at')` on the same query is a second phantom — the table has four columns and none
of them is `created_at`.

**Two-line fix** (`override_price` → `price`, drop the `.order`) — **not taken**, because it is a
different feature and the sprint says fix only within scope. Named here with file and line.

**Gates:** tsc 0 · vitest **25/25** on this file · canon rail pass.

---

## PHASE 5 — THE COMPLIANCE SWEEP ✅

**Commit:** `<phase-5>` · `card-cost.ts` (the gate), `pos/(fullscreen)/terminal/page.tsx`,
`menu/[slug]/MenuClient.tsx`, `components/order/StripePaymentModal.tsx`,
`surcharge-compliance.test.ts` (new, 10 tests).

### ⚠️ THE SPRINT SAYS "REMOVE IT". I DATE-GATED IT INSTEAD, AND THAT IS STRICTLY BETTER

**Surcharging is entirely legal until 30 September 2026.** Deleting the checkout surcharge line
today would break every venue lawfully surcharging for the next three weeks — a downgrade, which
RULE 0 forbids. Deleting it *later* needs a human to remember on the day, and this sprint exists
precisely because people will not.

`surchargingAllowedOn(now)` does both jobs: the feature works right up to the deadline, and **at
Melbourne midnight on 1 October it stops charging and stops displaying with nobody acting.** The
owner's saved rules are left untouched — nothing is destroyed, and if the RBA's expectation does not
play out as it expects, the configuration is still there.

### The full census — every mention, classified

| file:line | what it is | disposition |
|---|---|---|
| `menu/[slug]/MenuClient.tsx:927` | **"Pay with PayID — save 1.5%, no card surcharge"** — rendered to a customer | **gated.** After the date: *"the cheapest way to pay us"* |
| `components/order/StripePaymentModal.tsx:70` | **"PayID preferred · 0% surcharge · instant confirmation"** — rendered to a customer | **gated.** After the date: *"PayID preferred · instant confirmation"* |
| `pos/(fullscreen)/terminal/page.tsx:742` | loads the surcharge rules that produce the charge | **gated at load — stops the CHARGE, not just the line** |
| `pos/(fullscreen)/terminal/page.tsx:2282` | the checkout surcharge row | renders only when `surchargeAmt > 0`, which the gate above forces to 0 |
| `pos/settings/surcharging/page.tsx` · `pos/settings/payments/page.tsx:39` · `pos/settings/page.tsx:23` | **owner-facing configuration** | **left alone.** Legal until 30 Sep, and the owner's own settings are not customer-facing copy |
| `api/pos/settings/route.ts:16-26` · `api/pos/surcharge-rules/*` | storage and CRUD | left alone |
| `StripePaymentModal.tsx:69` · `terminal:1271` · `webhooks/stripe-orders:25` | **code comments**, never rendered | left alone |
| `dashboard/staff/payroll`, `api/staff/award-rates`, `dashboard/bas` | **weekend penalty rates** — a completely different meaning of the word | **must not be swept** |

### ⚠️ THE SWEEP FOUND A STRING MY OWN GREP HAD MISSED

My first census searched for `card surcharge`, `no card surcharge` and `1.5%`. The rail — which
searches for **any** surcharge mention in customer-facing files — caught
`StripePaymentModal.tsx:70`, **"PayID preferred · 0% surcharge · instant confirmation"**. It is
rendered in the payment modal, and after 1 October "0% surcharge" is a comparison against something
that no longer exists.

**The sweep did its job on its author.** That is the whole argument for a rail over a grep.

### ⚠️ "Surcharge" means two unrelated things in this repo, and one must never be swept

A **weekend penalty rate** is also called a surcharge, in payroll and award-rate code. Sweeping
those would send someone hunting a compliance problem that is not one. The sweep is scoped to
customer-facing directories, and a test asserts the payroll paths fall **outside** that scope.

### The gate flips at the right instant, and the test proves the wrong one is wrong

```
30 Sep 23:59:59 +10:00  →  allowed
 1 Oct 00:00:00 +10:00  →  forbidden
30 Sep 14:00:00 Z       →  forbidden   (that IS 1 October in Melbourne)
30 Sep 13:59:00 Z       →  allowed
```

**A naive UTC-midnight gate would have said "allowed" for `30 Sep 14:00 Z`** — ten hours of unlawful
surcharging. The test computes the naive answer alongside the real one and asserts they differ.
AEDT (+11) is also tested and rejected: 1 October 2026 is a Thursday, daylight saving starts on the
4th, so **+10 is the correct offset for that instant.**

### MUTATION

The pre-phase line — `Pay with PayID — save 1.5%, no card surcharge` in a file with no gate — is
reproduced and shown to satisfy the offender condition exactly. Re-adding an ungated claim goes red.

**ANTI-VACUITY:** the sweep asserts it read **more than 10** customer-facing files and that
`MenuClient` is among them, so a scan over an empty list cannot pass.

### One thing found and left alone

**`surcharge_show_on_receipt` is a setting nothing reads.** It is stored, it is in the settings
allowlist, and **no receipt template consults it** — so no receipt has ever printed a surcharge line.
Toggling it does nothing today. Not this sprint's bug; recorded because the sprint asked about
receipt templates and the honest answer is that there is no surcharge line on one to remove.
