import { describe, it, expect, afterEach } from 'vitest'
import { greetingForHour, currentGreeting } from '@/lib/greeting'

// FIX-HYDRATION-1 C4 — the guard.
//
// What it prevents recurring: a greeting derived from the MACHINE's clock. Vercel runs UTC, the
// customer's browser runs Melbourne, and the two rendered different text into the same node —
// React #425, with #418/#423 as the cascade. The Sentry event was 9:33pm AEST = 11:33 UTC:
// server "morning", browser "evening".

const ORIGINAL_TZ = process.env.TZ
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('greetingForHour — pure, so it cannot drift with the clock', () => {
  it('maps the boundaries exactly as the deleted helper did', () => {
    // Same cutoffs as MenuClient's getGreeting(), so this is a move, not a behaviour change.
    expect(greetingForHour(0)).toBe('morning')
    expect(greetingForHour(11)).toBe('morning')
    expect(greetingForHour(12)).toBe('afternoon')
    expect(greetingForHour(16)).toBe('afternoon')
    expect(greetingForHour(17)).toBe('evening')
    expect(greetingForHour(23)).toBe('evening')
  })

  it('THE BUG, reproduced: 11 UTC and 21 AEST are the same instant but different greetings', () => {
    // This is why an hour computed from the local clock cannot be trusted across a server/client
    // boundary — the two machines are in different zones at the same moment.
    expect(greetingForHour(11)).toBe('morning')
    expect(greetingForHour(21)).toBe('evening')
    expect(greetingForHour(11)).not.toBe(greetingForHour(21))
  })
})

describe('currentGreeting — identical regardless of the process timezone', () => {
  it('returns the same value under TZ=UTC and TZ=Australia/Melbourne', () => {
    process.env.TZ = 'UTC'
    const asUtc = currentGreeting()
    process.env.TZ = 'Australia/Melbourne'
    const asMelbourne = currentGreeting()
    // If this ever fails, the greeting has started depending on the machine's clock again and the
    // hydration mismatch is back.
    expect(asUtc).toBe(asMelbourne)
  })

  it('and under a deliberately hostile timezone', () => {
    process.env.TZ = 'Pacific/Kiritimati'   // UTC+14, the furthest ahead
    const far = currentGreeting()
    process.env.TZ = 'Pacific/Midway'       // UTC-11, the furthest behind
    const behind = currentGreeting()
    expect(far).toBe(behind)
  })
})
