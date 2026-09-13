/**
 * M17 · BRAIN-1 PHASE 2 — STAGE 1's FEATURE EXTRACTION.
 *
 * ⚠️ EVERY REGEX IN THIS FILE WAS EXTRACTED FROM route.ts BY A SCRIPT, NOT RETYPED. Twenty-five
 * patterns of this density cannot be transcribed by hand without introducing a difference nobody
 * would ever find, and phase 6 has to prove the spine changed nothing. The `route.ts:NNN` comment on
 * each line is where it came from.
 *
 * ⚠️ NOT ONE OF THEM IS DELETED, REWORDED, REORDERED OR MERGED. `isStrategicQuestion` is the regex
 * that decides whether the four-brain council runs at ~10,000 tokens or a Haiku tool loop runs at
 * ~1,000 — adding "why" to a question changes the cost and the quality of the answer. That is a real
 * problem and it is **M19's**, which replaces the pair of classifiers and this whole set with one
 * structured call. A structural sprint that also changed behaviour could not prove it changed
 * nothing, so here they only MOVE.
 *
 * MEASURED, and correcting the number this sprint's own phase 0 first reported: **20 named regex
 * constants + 5 written inline = 25 regexes that test the raw message**, feeding 18 booleans. Phase
 * 0 said "22 named + 3 inline"; that split came from a grep whose pattern also matched
 * `const isX = /…/.test(message)` lines. The total of 25 was right, the split was not.
 */
import type { ClassifiedIntent } from '@/lib/aria/ask/intent'
import type { AriaIntent } from '@/lib/aria/ask/aria-intent'
import type { FeatureName, TurnFeatures } from './types'

/* ── the 20 named constants, verbatim ──────────────────────────────────────────────────────────── */

export const AGENT_COMPOSE_RE = /\b(create|build|make|set ?up|compose)\b[\s\S]{0,40}\ban? agent\b/i // route.ts:617
export const ACTION_KEYWORDS = /\b(update|change|mark|set|adjust|apply|create|make|give|reduce|increase|launch|add|start|run|remove|subtract|deactivate|reactivate|disable|enable|archive|cut|lower|raise|schedule|draft)\b/i // route.ts:647
export const ACTION_SUBJECTS = /\b(price|prices|stock|products?|inventory|staff|permission|discount|promo|promotion|bundle|deal|offer|campaign|roster|invoice|sale)\b/i // route.ts:648
export const ACTION_SHAPE = /\b\d+\s*%\s*off\b|\$\s*\d+\s*off\b|\bpercent off\b|\bbogo\b|buy[- ]?one[- ]?get|half[- ]?price|\b2\s*for\s*1\b|\bbuy\s*\d+\s*get\b/i // route.ts:653
export const EDIT_STRONG = /\b(turn it (off|on)|end it|deactivate it|reactivate it)\b/i // route.ts:661
export const EDIT_SOFT = /\b(actually|change it|make it|set it to|instead|bump it|drop it)\b/i // route.ts:662
export const LOOKUP_WORDS = /\b(summary|report|list|show me|breakdown|overview|how many|how much|what are|which)\b/i // route.ts:667
export const STRONG_ACTION = /\b(create|set up|launch|start|run|apply|add)\b[\s\S]{0,40}\b(promotion|promo|discount|deal|offer|sale|\d+\s*%\s*off|\$\s*\d+\s*off|bogo)\b/i // route.ts:668
export const STRONG_TOGGLE = /\b(deactivate|reactivate|disable|enable|archive|unarchive)\b/i // route.ts:672
export const STRONG_STOCK = /\b(set|add|remove|subtract|reduce|increase|adjust|restock)\b[\s\S]{0,30}\b(stock|inventory|on[- ]?hand|qty|quantity|units?)\b/i // route.ts:673
export const NAV_PATTERN = /\b(where|how do i|how to|find|open|go to|navigate|get to|access|show me|take me to|can i find|can i see)\b.{0,60}\b(pos|terminal|dashboard|staff|roster|inventory|stock|reports?|reviews?|customers?|autopilot|daily briefing|intelligence|analytics|settings|reels|social|marketing|promotions?|loyalty|gift card|laybys?|tables?|kds|kitchen|timesheets?|payroll|leave|schedule|shifts?|cash|end.?of.?day|stocktake|suppliers?|purchase orders?|invoices?|bookings?|orders?|community|chat|website chat|warehouse|compliance|billing|plan|integrations?|xero|receipts?|barcode|price tick|labels?|waste|void|fitting room|split|competitors?|display|ask aria|agents?|churn|winback|missed demand|profit leak|delivery|recipes?|slow day|weekly|shift report|reorder|bas|tax|ad network|seo|tabs?|quotes?|bundles?|variance)\b/i // route.ts:797
export const COREF_FOLLOWUP = /\b(she|he|her|him|hers|his|they|them|their|theirs|it|its|that|those|these|the customer|the product|the order|this one|that one|the last one|same one)\b/i // route.ts:820
export const MULTI_DOMAIN_TRIGGERS = /\b(weekly review|full summary|how (is|are) (everything|my business)|give me (an? )?overview|how (did|am) (i|we) (do|doing)|complete briefing|all (of )?my metrics|overall (performance|status))\b/i // route.ts:926
export const SPREADSHEET_RE = /spreadsheet|\bcsv\b|excel|export/i // route.ts:962
export const BACKGROUND_TRIGGERS = /\b(analyse (all|every|my entire|my full)|research (all|every)|when (you'?re|you are) done|let me know when|notify me when|run in the background|come back to me|i.?ll check later)\b/i // route.ts:1007
export const BREVITY_SIGNALS = /^\s*(just tell me|just |quickly|tldr|tl;dr|in one number|single number)\b/i // route.ts:1061
export const SHORT_FACTUAL = /^.{0,60}\b(how much|what'?s my|what is my|today'?s|this week'?s|this month'?s|revenue today|orders today)/i // route.ts:1062
export const STRATEGIC_RE = /\b(should|recommend|strateg|improve|grow|growth|why|how (do|can|should) (i|we)|advice|advise|suggest|optimi[sz]e|forecast|opportunit|what would|plan to|help me)\b/i // route.ts:1070
export const DATA_LOOKUP_RE = /\b(who('?s| is| are)?|what('?s| is| are)?|which|how many|how much|list|show me|top|best|lowest|highest|worst)\b/i // route.ts:1071
export const RESEARCH_TRIGGERS = /\b(what are the (latest|current|recent)|look up|find out|what is the (current|going rate|average|market|industry)|industry (average|benchmark|standard|rate)|market (rate|price|average|data)|trends? in|how does .{1,30} compare|benchmark|competitor analysis)\b/i // route.ts:2330

/* ── the 5 written inline in route.ts, given names here so they can be tested ──────────────────── */

/** route.ts:654 — inline in `const isStrategicQuestion = …`. THE regex that decides the council. */
export const STRATEGIC_QUESTION_RE = /should|recommend|best|strategy|improve|why|how can|what would|advice|suggest|analyse|analyze|compare|forecast|plan|opportunity|risk|growth|optimise|optimize/i
/** route.ts:663 — the value cue that stops a conversational "actually…" proposing an action. */
export const EDIT_VALUE_CUE_RE = /[\d%$]/
/** route.ts:2208 — inline in `const isImageRequest = …`. */
export const IMAGE_REQUEST_RE = /poster|image|graphic|visual|banner|flyer|photo|picture|generate.*image|create.*image/i
/** route.ts:2294 — one term of `needsSonnet`. */
export const NEEDS_SONNET_RE = /(live.?render|generate.?html|heatmap|complex.?chart|analysis|compare.*week|profit.*if|what.*happen|should.*hire|strategy|forecast|predict|multi.?step|deep.?dive|breakdown|reconcil|cash.?flow.*analysis)/i
/** route.ts:2298 — one term of `needsTools`. */
export const NEEDS_TOOLS_RE = /(export|download|report|spreadsheet|csv|pdf|send|sms|email|restock|reorder|purchase.?order|schedule|roster|invoice|generate|create|update|set.?price|change.?price)/i

/** Every routing regex, so a test can assert the set is complete rather than trust a comment. */
export const ROUTING_REGEXES = {
  AGENT_COMPOSE_RE,
  ACTION_KEYWORDS,
  ACTION_SUBJECTS,
  ACTION_SHAPE,
  EDIT_STRONG,
  EDIT_SOFT,
  LOOKUP_WORDS,
  STRONG_ACTION,
  STRONG_TOGGLE,
  STRONG_STOCK,
  NAV_PATTERN,
  COREF_FOLLOWUP,
  MULTI_DOMAIN_TRIGGERS,
  SPREADSHEET_RE,
  BACKGROUND_TRIGGERS,
  BREVITY_SIGNALS,
  SHORT_FACTUAL,
  STRATEGIC_RE,
  DATA_LOOKUP_RE,
  RESEARCH_TRIGGERS,
  STRATEGIC_QUESTION_RE,
  EDIT_VALUE_CUE_RE,
  IMAGE_REQUEST_RE,
  NEEDS_SONNET_RE,
  NEEDS_TOOLS_RE
} as const

/* ── the 18 booleans ───────────────────────────────────────────────────────────────────────────── */

export interface FeatureInput {
  readonly message: string
  readonly intent: ClassifiedIntent
  readonly ariaIntent: AriaIntent
  readonly conversationId: string | null
  readonly clientMessageCount: number
  readonly attachmentCount: number
  readonly hasImages: boolean
}

/**
 * The same expressions `_POST` computes, in the same order, with the same operands.
 *
 * ⚠️ `needsSonnet` and `needsTools` are computed here too even though they select a MODEL rather
 * than a lane. They are part of the same set of message-derived booleans, and leaving them behind in
 * the route would have been the start of a second copy.
 */
export function extractFeatures(input: FeatureInput): TurnFeatures {
  const { message, intent, ariaIntent, conversationId, clientMessageCount, attachmentCount, hasImages } = input

  // route.ts:654
  const isStrategicQuestion = STRATEGIC_QUESTION_RE.test(message)
  // route.ts:663
  const isEditIntent = EDIT_STRONG.test(message) || (EDIT_SOFT.test(message) && EDIT_VALUE_CUE_RE.test(message))
  // route.ts:674
  const isActionRequest = ACTION_KEYWORDS.test(message) && (ACTION_SUBJECTS.test(message) || ACTION_SHAPE.test(message)) && intent.type === 'question'
  // route.ts:675
  const isStrongAction = (STRONG_ACTION.test(message) || STRONG_TOGGLE.test(message) || STRONG_STOCK.test(message)) && !LOOKUP_WORDS.test(message) && !isStrategicQuestion
  // route.ts:678
  const planTrigger = isStrongAction || ((isActionRequest || isEditIntent) && !isStrategicQuestion && ariaIntent.intent_type !== 'analytical')
  // route.ts:618
  const isAgentCompose = AGENT_COMPOSE_RE.test(message)
  // route.ts:821
  const isCoreferentialFollowup = COREF_FOLLOWUP.test(message) && (!!conversationId || clientMessageCount > 0)
  // route.ts:798 — the NAV_FASTPATH env gate is a ROUTING decision and stays in decide(), not here.
  const isNavQuestion = NAV_PATTERN.test(message)
  // route.ts:927
  const isMultiDomain = intent.type === 'question' && MULTI_DOMAIN_TRIGGERS.test(message) && ariaIntent.intent_type !== 'analytical'
  // route.ts:963
  const isSpreadsheetRequest = SPREADSHEET_RE.test(message)
  // route.ts:1008
  const isBackgroundTask = intent.complexity === 'complex' && BACKGROUND_TRIGGERS.test(message)
  // route.ts:1063
  const isBrevityQuestion = BREVITY_SIGNALS.test(message) || SHORT_FACTUAL.test(message)
  // route.ts:1072
  const isDataLookup = DATA_LOOKUP_RE.test(message) && !STRATEGIC_RE.test(message)
  // route.ts:2208
  const isImageRequest = IMAGE_REQUEST_RE.test(message)
  // route.ts:372 — the UI's save-plan sentinel, an exact match rather than a pattern.
  const isSavePlan = message === '[ARIA_SAVE_PLAN]'
  // route.ts:2289-2294
  const needsSonnet =
    intent.complexity === 'complex' ||
    intent.type === 'troubleshoot' ||
    intent.type === 'technical' ||
    hasImages ||
    attachmentCount > 0 ||
    NEEDS_SONNET_RE.test(message)
  // route.ts:2297-2299
  const needsTools = NEEDS_TOOLS_RE.test(message) || attachmentCount > 0
  // route.ts:2331
  const wantsResearch = RESEARCH_TRIGGERS.test(message)

  return {
    isStrategicQuestion, isEditIntent, isActionRequest, isStrongAction, planTrigger, isAgentCompose,
    isCoreferentialFollowup, isNavQuestion, isMultiDomain, isSpreadsheetRequest, isBackgroundTask,
    isBrevityQuestion, isDataLookup, isImageRequest, isSavePlan, needsSonnet, needsTools,
    wantsResearch,
  }
}

/** The features that were TRUE — what the turn record stores, so a lane choice can be explained. */
export function firedFeatures(f: TurnFeatures): FeatureName[] {
  return (Object.keys(f) as FeatureName[]).filter(k => f[k])
}
