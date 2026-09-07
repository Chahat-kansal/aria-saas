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
