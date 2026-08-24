/**
 * MS15 PHASE 3 — THE VERIFIER.
 *
 * Every generated claim is checked against ground truth BEFORE it reaches an owner. This is the
 * differentiator: everyone has the same models, nobody in hospitality software can say "our
 * answers are checked". A prompt instruction makes a fabrication unlikely; a verifier makes it
 * undeliverable.
 *
 * PURE ON PURPOSE. Ground truth is passed in; nothing here queries, and nothing here calls a
 * model. That makes every rule testable to the character, and it means the verifier cannot itself
 * become a source of latency or of new failure.
 *
 * IT SITS AFTER GENERATION. It does not rewrite prompts and it does not "improve" an answer — on
 * failure it REFUSES or HEDGES, and the unverified claim never ships. A blocked answer is a
 * feature: the alternative is a confident wrong number, which is the single most expensive thing
 * this product can do (a briefing once computed every percentage against a fabricated $999,999
 * target, and margins were reported as exactly 60% storewide from a price*0.4 cost).
 */

export type VerdictCode =
  | 'ok'
  | 'unverified_number'
  | 'unknown_entity'
  | 'weak_cost_provenance'
  | 'house_rule_conflict'
  | 'allergen_refusal'

export interface GroundTruth {
  /** Every number that is SAFE TO CITE this turn, already computed from real rows. */
  anchors: number[]
  /** Names that exist: products, suppliers, staff. Compared case-insensitively. */
  entities: { products?: string[]; suppliers?: string[]; staff?: string[] }
  /** Per-product cost provenance tier, from resolve-cost.ts. */
  costProvenance?: Record<string, 'outlet' | 'last_delivery' | 'purchase_order' | 'catalogue' | 'unknown'>
  /** Active house rules, in the owner's words. */
  houseRules?: string[]
}

export interface VerifierFinding {
  code: VerdictCode
  detail: string
  /** The exact fragment that failed, so a human can see what was caught. */
  evidence: string
}

export interface VerifierResult {
  ok: boolean
  findings: VerifierFinding[]
  /** What to do with the response: ship it, hedge it, or refuse it outright. */
  action: 'pass' | 'hedge' | 'refuse'
  /** The owner-facing text when action !== 'pass'. Never contains the unverified claim. */
  safeResponse?: string
}

// ── tolerances ───────────────────────────────────────────────────────────────────────────────────
/** Anchors are matched within 0.5% — a rounded citation of a real figure is not a fabrication. */
const ANCHOR_TOLERANCE = 0.005

/** Cost tiers too weak to support a stated margin. `catalogue` is the fabricated price*0.4 tier. */
const WEAK_COST_TIERS = new Set(['catalogue', 'unknown'])

// A currency or percentage figure in generated prose.
const NUMBER_RE = /(?:A?\$\s?-?[\d,]+(?:\.\d+)?)|(?:-?[\d,]+(?:\.\d+)?\s?%)/g

/**
 * A bare COUNT with the noun it counts — "412 loyalty members", "128 reviews", "2 units left",
 * "60-day terms". The eval set found these walking straight past the currency pattern, and a
 * fabricated count of customers is no less damaging than a fabricated dollar. Scoped to nouns
 * this product actually reports, so ordinary prose ("3 ways to fix this") is not caught.
 */
// Up to two short words may sit between the number and its noun — "412 loyalty members",
// "37 of your customers". Found by the eval set: the first version required them adjacent and
// missed both of the phrasings Aria actually writes.
const COUNT_RE = /\b(\d[\d,]*(?:\.\d+)?)[\s-]?(?:\w{1,8}\s){0,2}(?:units?|members?|reviews?|customers?|sales|orders?|staff|hours?|stars?|transactions?|covers?|visits?)\b/gi

/** Allergen and dietary-safety questions: model output may never answer these, gated or not. */
// NOTE the plurals and the trailing-stem forms: the first version of this pattern used
// \ballergen\b, which does NOT match "allergens" (no word boundary between n and s) — the
// single most common phrasing of the question walked straight through the locked rule. A
// safety rule with a near-miss in its pattern is worse than none, because it reads as covered.
const ALLERGEN_RE = /\b(allergens?|allerg(?:y|ies|ic)|gluten[- ]?free|coeliacs?|celiacs?|nut[- ]?free|peanuts?|dairy[- ]?free|lactose|vegan|vegetarian|halal|kosher|anaphyla\w*|intoleran\w*|contains? (?:nuts|dairy|gluten|soy|egg|shellfish))\b/i

/** Phrases that state a margin, which is only as trustworthy as the cost beneath it. */
const MARGIN_RE = /\b(margin|markup|gross profit|GP)\b/i

/**
 * A response that DECLINES to give a figure is not making the claim the rule guards against.
 * The eval set caught this on its first run: "I can't give you a trustworthy margin on Flat White"
 * was flagged for weak cost provenance — i.e. the verifier was blocking the very hedge it exists
 * to produce. A guard that punishes the correct answer teaches people to switch it off.
 */
const DECLINING_RE = /\b(can'?t|cannot|couldn'?t|not able to|no |don'?t have|isn'?t recorded|is unknown|unknown|nothing to|won'?t)\b[^.]{0,60}\b(give|tell|say|state|compute|calculate|prove|trustworthy|reliable|confirm|track|total|rank|figure|margin|cost)\b/i

function parseFigure(raw: string): number | null {
  const cleaned = raw.replace(/[A$,%\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function matchesAnyAnchor(value: number, anchors: number[]): boolean {
  return anchors.some(a => {
    if (a === value) return true
    const scale = Math.max(Math.abs(a), Math.abs(value), 1)
    return Math.abs(a - value) / scale <= ANCHOR_TOLERANCE
  })
}

/** Word-boundary presence of a name in text, case-insensitive. */
function mentions(text: string, name: string): boolean {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escaped) return false
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

/**
 * Verify a generated response against ground truth.
 *
 * `question` matters for exactly one rule — the allergen refusal, which fires on the QUESTION
 * regardless of what the answer says, because the safe behaviour is not answering at all.
 */
export function verifyResponse(args: {
  response: string
  question?: string
  ground: GroundTruth
  /** Product names the response is discussing, for the cost-provenance check. */
  subjectProducts?: string[]
}): VerifierResult {
  const response = String(args.response ?? '')
  const findings: VerifierFinding[] = []
  const ground = args.ground ?? { anchors: [], entities: {} }
  const anchors = ground.anchors ?? []

  // ── RULE 5 (checked first — it refuses outright) — ALLERGEN / DIETARY SAFETY ────────────────
  // The locked rule: no model output answers these on any surface, gated or disclaimed or not.
  // It fires on the QUESTION, because a confident-sounding correct answer is as forbidden as a
  // wrong one — the failure mode is somebody eating something.
  const allergenText = `${args.question ?? ''}`
  if (ALLERGEN_RE.test(allergenText)) {
    findings.push({
      code: 'allergen_refusal',
      detail: 'Allergen and dietary-safety questions are never answered by generated text.',
      evidence: (args.question ?? '').slice(0, 160),
    })
    return {
      ok: false,
      findings,
      action: 'refuse',
      safeResponse:
        "I can't answer allergen or dietary-safety questions — getting one wrong could make someone " +
        'ill, so this never comes from me. Check the product\'s own labelling, or the allergen fields ' +
        'your team maintains, and confirm with your supplier if anything is unclear.',
    }
  }

  // ── RULE 1 — every stated figure must trace to an anchor ────────────────────────────────────
  const countMatches = [...response.matchAll(COUNT_RE)].map(m => m[1])
  for (const raw of [...(response.match(NUMBER_RE) ?? []), ...countMatches]) {
    const value = parseFigure(raw)
    if (value === null) continue
    if (value === 0) continue // "$0.00" / "0%" states an absence, not a measurement
    if (!matchesAnyAnchor(value, anchors)) {
      findings.push({
        code: 'unverified_number',
        detail: 'Figure does not match any value computed from the business’s data this turn.',
        evidence: raw.trim(),
      })
    }
  }

  // ── RULE 2 — every named product, supplier or staff member must exist ───────────────────────
  const known = new Set(
    [...(ground.entities?.products ?? []), ...(ground.entities?.suppliers ?? []), ...(ground.entities?.staff ?? [])]
      .map(n => n.trim().toLowerCase())
      .filter(Boolean),
  )
  // Quoted names and Title-Case runs are the shapes a fabricated entity actually takes.
  const candidates = new Set<string>()
  for (const m of response.match(/"([^"]{2,40})"|“([^”]{2,40})”/g) ?? []) candidates.add(m.replace(/["“”]/g, '').trim())
  for (const m of response.match(/\b(?:[A-Z][a-z]{2,}\s){1,3}[A-Z][a-z]{2,}\b/g) ?? []) {
    const whole = m.trim()
    candidates.add(whole)
    // …and the same run WITHOUT its first word: a Title-Case run that begins a sentence swallows
    // the framing word ("Your Caramel Macchiato Deluxe"), which left the rule looking for a
    // phrase that could never appear. Both forms are considered; only a framed one is flagged.
    const tail = whole.split(/\s+/).slice(1).join(' ')
    if (tail.split(/\s+/).length >= 2) candidates.add(tail)
  }
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase()
    if (known.has(lower)) continue
    // Only flag when the response frames it as one of OUR things — otherwise every ordinary
    // Title-Case phrase ("Last Tuesday", "Fair Work") becomes a false positive.
    // Framing = the response asserts a RELATIONSHIP to this name: it is ours ("your X", "the X",
    // "from X") or it did something ("X sold", "X worked"). Found by the eval set: a fabricated
    // product introduced as "Your Caramel Macchiato Deluxe" carried none of the original frames.
    const esc = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const framed = new RegExp(`(?:(?:product|supplier|staff|item|SKU|from|by|your|the|drop)\\s+"?${esc})|(?:${esc}\\s+(?:sold|worked|billed|supplies|gives|charges|costs|delivered))`, 'i')
    if (framed.test(response) && known.size > 0) {
      findings.push({
        code: 'unknown_entity',
        detail: 'Named as a product, supplier or staff member, but no such record exists.',
        evidence: candidate,
      })
    }
  }

  // ── RULE 3 — a margin claim needs a cost you can stand behind ───────────────────────────────
  if (MARGIN_RE.test(response) && !DECLINING_RE.test(response) && ground.costProvenance) {
    for (const product of args.subjectProducts ?? Object.keys(ground.costProvenance)) {
      const tier = ground.costProvenance[product]
      if (!tier) continue
      if (!mentions(response, product) && (args.subjectProducts ?? []).length === 0) continue
      if (WEAK_COST_TIERS.has(tier)) {
        findings.push({
          code: 'weak_cost_provenance',
          detail: `Margin stated for "${product}" from a ${tier}-tier cost — not recorded from a purchase.`,
          evidence: product,
        })
      }
    }
  }

  // ── RULE 4 — never contradict an active house rule ──────────────────────────────────────────
  for (const rule of ground.houseRules ?? []) {
    const m = String(rule).match(/\b(?:never|no|don'?t|do not)\b[^.;\n]{0,24}\bdiscount(?:s|ing|ed)?\b(?:\s+(?:on|for|the)\b)?\s*([^.;\n]{0,40})/i)
    if (!m) continue
    for (const word of String(m[1] ?? '').toLowerCase().split(/[^a-z0-9']+/)) {
      if (word.length < 3) continue
      const proposesDiscount = /\b(discount|% ?off|markdown|special|promo|promotion|bogo|half[- ]price)\b/i.test(response)
      // CITING the rule is not BREAKING it. "Since you never discount coffee, the lever is a food
      // bundle" was flagged as a conflict on the eval set's first run — the response was obeying
      // the rule out loud, which is exactly the behaviour we want to encourage.
      const citesTheRule = new RegExp(`\\b(?:never|don'?t|do not|no)\\b[^.;]{0,24}\\bdiscount\\w*\\b[^.;]{0,20}\\b${word}\\b`, 'i').test(response)
      if (proposesDiscount && !citesTheRule && mentions(response, word)) {
        findings.push({
          code: 'house_rule_conflict',
          detail: `Contradicts an active house rule: "${rule}".`,
          evidence: word,
        })
        break
      }
    }
  }

  if (findings.length === 0) return { ok: true, findings: [], action: 'pass' }

  // A fabricated number or a non-existent entity is not hedgeable — the claim itself is the
  // problem, so the response is refused and the owner is told what could not be confirmed.
  const mustRefuse = findings.some(f => f.code === 'unverified_number' || f.code === 'unknown_entity')
  if (mustRefuse) {
    return {
      ok: false,
      findings,
      action: 'refuse',
      safeResponse:
        "I couldn't confirm part of that answer against your data, so I'm not going to give you the " +
        'figure — a number that looks right and is wrong is worse than no number. Ask me again and ' +
        "I'll pull it directly, or open the matching report and I'll work from what you see there.",
    }
  }

  // A weak-provenance margin or a house-rule clash is real information, delivered with the caveat.
  const reasons = findings.map(f => f.detail).join(' ')
  return {
    ok: false,
    findings,
    action: 'hedge',
    safeResponse: `One caveat before you rely on this: ${reasons}`,
  }
}
