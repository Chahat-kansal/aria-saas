// SPOTLIGHT-TOUR-1 — shared step definitions used by both the tour progress
// API (auto-completion checks) and the SpotlightTour component (narration +
// anchoring). Narration is templated and data-filled — no AI call — so the
// tour works even at $0 API credits. Written in Aria's voice per
// src/lib/aria-voice-guide.ts (specific, plain Australian English, no
// filler/forbidden phrases) without importing that file into the client
// bundle — it's a system-prompt string for Claude routes, not UI copy.

export interface TourData {
  businessName: string
  industry: string
  productCount: number
  slug: string | null
  /** Real enabled automations for THIS business — grounds the "what I run for you" step. */
  automations: string[]
}

export const ASK_ARIA_STARTERS = [
  'What were my top products this week?',
  "How's my business doing today?",
  'What should I focus on?',
] as const

// The propose->approve guardrail — fixed policy, not per-business config.
export const ARIA_ASKS_FIRST = [
  'Anything spending money (reorders, discounts, promos)',
  'Sending bulk messages to customers',
  'Changing prices',
] as const

export interface TourStep {
  key: string
  href: string
  /** data-tour attribute value to find/highlight on the current page; null = informational, no page anchor. */
  dataTourId: string | null
  title: string
  narration: (d: TourData) => string
  ctaLabel: string
  /** Shown once this step (or a later one) is already complete — lets the tour skip straight past it. */
  autoCompleteHint?: (d: TourData) => string
}

export const TOUR_STEPS: TourStep[] = [
  {
    key: 'products',
    href: '/pos/products',
    dataTourId: null,
    title: 'Your products are in',
    narration: d => `Nice work — you've added ${d.productCount} product${d.productCount === 1 ? '' : 's'} for ${d.businessName}. I've already used them to set up your categories and POS. Let's get the rest of your shop running.`,
    ctaLabel: "Let's go",
  },
  {
    key: 'test_sale',
    href: '/pos/terminal',
    dataTourId: 'test_sale',
    title: 'Ring up a test sale',
    narration: () => `Before: you'd guess whether the till actually works and hope for the best on day one. Aria way: let's ring up one real sale right now, on the house, so you know it works before a customer's watching. Add something to the cart, then hit Charge.`,
    ctaLabel: 'Take me to the POS',
  },
  {
    key: 'ask_aria',
    href: '/dashboard/ask-aria',
    dataTourId: 'ask_aria',
    title: 'Ask me anything about your shop',
    narration: d => `This is the bit most owners don't expect: I actually know ${d.businessName}'s real numbers. Tap one of the questions below and see for yourself — no typing required.`,
    ctaLabel: 'Try it',
  },
  {
    key: 'invite_staff',
    href: '/dashboard/staff/new',
    dataTourId: 'invite_staff',
    title: 'Add your team',
    narration: d => `Before: staff share your login, or you're the only one who can serve a customer. Aria way: give ${d.businessName}'s first team member their own POS login — I'll track their sales and hours separately from day one. Fill in the form and save.`,
    ctaLabel: 'Add a team member',
  },
  {
    key: 'cash_open',
    href: '/pos/manage-cash',
    dataTourId: 'cash_open',
    title: 'Set your opening cash float',
    narration: () => `Before: your cash flow view starts at zero and doesn't match what's actually in the till. Aria way: record your opening float now — takes ten seconds, and your cash position is accurate from your very first sale.`,
    ctaLabel: 'Record opening float',
  },
  {
    key: 'cash_flow',
    href: '/dashboard/cash-flow',
    dataTourId: 'cash_flow',
    title: 'Tell me your real costs',
    narration: () => `Right now I'm estimating your expenses at 68% of revenue because I don't know your real numbers yet. Add your actual fixed costs — rent, wages, subscriptions — and every cash flow forecast I give you gets sharper.`,
    ctaLabel: 'Add expenses',
  },
  {
    key: 'loyalty',
    href: '/pos/settings/loyalty',
    dataTourId: 'loyalty',
    title: 'Turn on rewards',
    narration: d => `Before: every sale at ${d.businessName} is a one-off — no reason for a customer to come back over the shop next door. Aria way: turn on points, and every purchase earns something. I'll track it and nudge customers back when they've gone quiet.`,
    ctaLabel: 'Turn on loyalty',
  },
  {
    key: 'cx_app',
    href: '',
    dataTourId: null,
    title: 'Your customers just got an app',
    narration: d => `Here's the fun part: ${d.businessName} now has its own customer app — wallet card, rewards, the lot — no download required. This is the bit owners never expect.`,
    ctaLabel: 'View your app',
  },
  {
    key: 'set_hours',
    href: '/dashboard/settings',
    dataTourId: 'set_hours',
    title: 'Confirm your trading hours',
    narration: () => `Quick one — confirm your trading hours so your customer app and Google listing always show the right open/closed status. Save your business details to lock them in.`,
    ctaLabel: 'Set trading hours',
  },
  {
    key: 'connect_google',
    href: '/dashboard/settings',
    dataTourId: 'connect_google',
    title: 'Connect Google Business',
    narration: () => `One more — link your Google Business listing and I'll start pulling in your reviews and ratings so you can see them alongside everything else, instead of checking a separate app.`,
    ctaLabel: 'Connect Google',
  },
  {
    key: 'aria_runs',
    href: '',
    dataTourId: null,
    title: 'What I run for you',
    narration: d => `Here's the deal, ${d.businessName}: I work in the background so you don't have to. Anything touching money, bulk messages, or prices — I bring it to you first. Everything else, I just handle.`,
    ctaLabel: "Got it, let's go",
  },
]

export function buildTourNarration(step: TourStep, data: TourData): string {
  return step.narration(data)
}
