import { SURCHARGE_BAN_FACTS, surchargingAllowedOn, type CardCostAssessment } from './card-cost'

/**
 * M14 PHASE 6 — THE CARD EVERY AUSTRALIAN VENUE SEES.
 *
 * ⚠️ CALM AND FACTUAL. NOT A SCARE CARD. The temptation with a dated regulatory change is a red
 * banner and a countdown, and it would be the wrong call twice over: most venues do not surcharge at
 * all, so for them the change is **good news** (their card costs fall), and the ones that do
 * surcharge need a number, not adrenaline.
 *
 * So the card says a different thing to each of the three venues this can be:
 *
 *   surcharges today          → there is something to do, and here is how much
 *   does not surcharge        → nothing is taken away from you; your costs fall
 *   already past the date     → it has happened; here is what changed
 *
 * The severity is `info` in every case except a venue that still surcharges with the deadline
 * close — and even then it is `warning`, never `critical`. Nothing here is an emergency.
 */
export type CardSeverity = 'info' | 'warning'

export interface SurchargeBanCard {
  /** Null when there is genuinely nothing to say to this venue. The caller renders nothing. */
  title: string
  body: string
  cta_label: string
  cta_href: string
  severity: CardSeverity
  days_until: number
  /** True once the change has taken effect — the card becomes past tense, not stale. */
  past: boolean
}

/** Whole days from `now` to the change, in Melbourne terms. Negative once it has passed. */
export function daysUntilChange(now: Date = new Date()): number {
  const target = Date.parse(SURCHARGE_BAN_FACTS.effective + 'T00:00:00+10:00')
  const days = Math.ceil((target - now.getTime()) / 86400000)
  // Math.ceil returns -0 for any fraction inside the final day, and "in -0 days" is not a sentence
  // anyone should read. Normalised here rather than at each call site.
  return days === 0 ? 0 : days
}

export function buildSurchargeBanCard(
  assessment: Pick<CardCostAssessment, 'action_required' | 'surcharge_today_pct'> | null,
  now: Date = new Date(),
): SurchargeBanCard {
  const days = daysUntilChange(now)
  const past = !surchargingAllowedOn(now)
  const href = '/dashboard/surcharge-ban'

  if (past) {
    return {
      title: 'Card surcharging has ended',
      body: 'Since 1 October the card networks no longer allow a surcharge at the terminal. '
        + 'Interchange caps also fell, so the wholesale part of your card costs is lower than it was.',
      cta_label: 'See what changed',
      cta_href: href,
      severity: 'info',
      days_until: days,
      past: true,
    }
  }

  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days'

  // ⚠️ A venue that does not surcharge is the common case, and for it this is GOOD NEWS. Telling it
  // to brace for a deadline would be false and would train owners to ignore the card.
  if (!assessment || assessment.action_required !== true) {
    return {
      title: 'Card costs fall on 1 October',
      body: 'You do not add a card fee, so nothing is taken away from you ' + when + '. '
        + 'The interchange caps drop on the same day, which makes the wholesale part of card '
        + 'payments cheaper. Nothing to do — worth knowing.',
      cta_label: 'See the numbers',
      cta_href: href,
      severity: 'info',
      days_until: days,
      past: false,
    }
  }

  const rate = assessment.surcharge_today_pct
  return {
    title: 'Your card fee has to go ' + when,
    body: (rate ? 'You add ' + rate.toFixed(2) + '% at the terminal. ' : 'You add a card fee at the terminal. ')
      + 'From 1 October the card networks are expected to forbid that under their scheme rules, so it '
      + 'has to go into your prices or come out of your margin. Aria can work out the exact rise that '
      + 'leaves you where you are.',
    cta_label: 'Work out the prices',
    cta_href: href,
    // Warning only when it still surcharges AND the date is close. Never critical.
    severity: days <= 30 ? 'warning' : 'info',
    days_until: days,
    past: false,
  }
}
