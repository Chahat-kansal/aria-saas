import { describe, it, expect } from 'vitest'
import { buildSurchargeBanCard, daysUntilChange } from './surcharge-card'

/**
 * M14 PHASE 6 — THE CARD.
 *
 * ⚠️ Calm and factual, not a scare card. Most venues do not surcharge at all, so for them 1 October
 * is GOOD NEWS — their card costs fall. A red countdown would be false for the majority and would
 * train every owner to ignore the card.
 */
const SEP_9 = new Date('2026-09-09T09:00:00+10:00')
const OCT_5 = new Date('2026-10-05T09:00:00+11:00')

describe('M14 phase 6 · the card says a different true thing to each venue', () => {
  it('a venue that DOES surcharge is told what to do, with its own rate', () => {
    const c = buildSurchargeBanCard({ action_required: true, surcharge_today_pct: 1.5 }, SEP_9)
    expect(c.title).toContain('has to go')
    expect(c.body).toContain('1.50%')
    expect(c.cta_label).toBe('Work out the prices')
    expect(c.past).toBe(false)
  })

  it('⚠️ a venue that does NOT surcharge is told it is good news, not warned', () => {
    // Sip. The majority case, and the one a scare card would get most wrong.
    const c = buildSurchargeBanCard({ action_required: false, surcharge_today_pct: 0 }, SEP_9)
    expect(c.title).toBe('Card costs fall on 1 October')
    expect(c.body).toContain('nothing is taken away from you')
    expect(c.body).toContain('Nothing to do')
    expect(c.severity).toBe('info')
  })

  it('after the date it is past tense, not a stale countdown', () => {
    const c = buildSurchargeBanCard({ action_required: true, surcharge_today_pct: 1.5 }, OCT_5)
    expect(c.past).toBe(true)
    expect(c.title).toBe('Card surcharging has ended')
    expect(c.severity).toBe('info')
    expect(c.days_until).toBeLessThan(0)
  })

  it('⚠️ NOTHING is ever critical, and no card says surcharging is illegal', () => {
    const cards = [
      buildSurchargeBanCard({ action_required: true, surcharge_today_pct: 1.5 }, SEP_9),
      buildSurchargeBanCard({ action_required: false, surcharge_today_pct: 0 }, SEP_9),
      buildSurchargeBanCard(null, SEP_9),
      buildSurchargeBanCard({ action_required: true, surcharge_today_pct: 1.5 }, OCT_5),
    ]
    for (const c of cards) {
      expect(['info', 'warning']).toContain(c.severity)
      const text = (c.title + ' ' + c.body).toLowerCase()
      for (const forbidden of ['illegal', 'unlawful', 'against the law', 'urgent', 'act now', '!']) {
        expect(text, forbidden).not.toContain(forbidden)
      }
      // It always says where to go, and never to a dead link.
      expect(c.cta_href).toBe('/dashboard/surcharge-ban')
      expect(c.cta_label.length).toBeGreaterThan(4)
    }
  })

  it('a surcharging venue is only WARNING when the date is close, never before', () => {
    const far = new Date('2026-01-01T09:00:00+10:00')
    expect(buildSurchargeBanCard({ action_required: true, surcharge_today_pct: 1.5 }, far).severity).toBe('info')
    expect(buildSurchargeBanCard({ action_required: true, surcharge_today_pct: 1.5 }, SEP_9).severity).toBe('warning')
  })

  it('an unknown assessment is treated as "does not surcharge" rather than alarming', () => {
    // GROUNDING-TEETH: with nothing read, the honest default is the calm one, not the loud one.
    const c = buildSurchargeBanCard(null, SEP_9)
    expect(c.severity).toBe('info')
    expect(c.title).toBe('Card costs fall on 1 October')
  })

  it('the countdown counts real days, and reads naturally at 0 and 1', () => {
    expect(daysUntilChange(new Date('2026-09-30T09:00:00+10:00'))).toBe(1)
    expect(daysUntilChange(new Date('2026-10-01T09:00:00+10:00'))).toBe(0)
    expect(daysUntilChange(SEP_9)).toBe(22)
    expect(buildSurchargeBanCard({ action_required: true, surcharge_today_pct: 1 }, new Date('2026-09-30T09:00:00+10:00')).title).toContain('tomorrow')
    expect(buildSurchargeBanCard({ action_required: false, surcharge_today_pct: 0 }, SEP_9).body).toContain('in 22 days')
  })

  it('ANTI-VACUITY — the three venue states produce three different cards', () => {
    const titles = new Set([
      buildSurchargeBanCard({ action_required: true, surcharge_today_pct: 1.5 }, SEP_9).title,
      buildSurchargeBanCard({ action_required: false, surcharge_today_pct: 0 }, SEP_9).title,
      buildSurchargeBanCard({ action_required: true, surcharge_today_pct: 1.5 }, OCT_5).title,
    ])
    expect(titles.size).toBe(3)
  })
})
