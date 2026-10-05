import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { KEY_SEEN_AT_IMPORT, OPENAI_KEY_SEEN_AT_IMPORT } from './__fixtures__/m18b-module-scope-key'
import { join } from 'node:path'

/**
 * M18B · PHASE 3 — WALL 11, TESTED BY TRIPPING IT.
 *
 * ⚠️ THE GUARD IS PROVEN BY USE, NOT BY INSPECTION. The throwaway test the sprint asks for ran once,
 * failed with the guard's message, and was deleted — that run is pasted in `RUN-M18B.md`. This file is
 * the permanent version: it actually attempts a provider call and asserts the throw, every run.
 *
 * Before `vitest.setup.ts` existed, the suite was free of charge **by accident** — no `setupFiles`
 * meant no key was loaded, so a client threw before the network. `fetch` itself was wide open. One
 * plausible commit (adding `dotenv` for a single integration test) would have armed all 1,868 tests.
 */

const PROVIDER_URLS = [
  'https://api.anthropic.com/v1/messages',
  'https://api.openai.com/v1/chat/completions',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=x',
]

describe('M18B phase 3 · WALL 11 — a unit test cannot reach a provider', () => {
  it.each(PROVIDER_URLS)('⚠️ BLOCKS %s', async url => {
    // This is a real `fetch` call. If the guard were removed, this test would make a real request —
    // which is precisely why it is the right test: it fails loudly either way, never silently.
    await expect(fetch(url, { method: 'POST' })).rejects.toThrow(/WALL 11/)
  })

  it('⚠️ THE FAILURE NAMES THE FILE AND THE TEST — "something called Anthropic" is not a diagnosis', async () => {
    const err = await fetch('https://api.anthropic.com/v1/messages').catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    const msg = (err as Error).message
    expect(msg).toContain('src/lib/live-model-guard.test.ts')
    expect(msg).toContain('THE FAILURE NAMES THE FILE')      // the test name, not just the path
    expect(msg).toContain('api.anthropic.com')               // which host it was
    expect(msg).toContain('ARIA_ALLOW_LIVE_MODELS=1')        // and the one way out
  })

  it('⚠️ DOES NOT BLOCK EVERYTHING — anti-vacuity, and the reason the guard stays enabled', async () => {
    // A blanket `fetch` ban would fail tests that legitimately stub or call non-provider URLs, and a
    // guard people must disable to get work done is one that gets disabled permanently. A non-provider
    // host must reach the real `fetch` — asserted by the error being a NETWORK error, not WALL 11.
    const err = await fetch('http://127.0.0.1:9/definitely-not-listening').catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toContain('WALL 11')
  })

  it('⚠️ SUBDOMAINS OF A PROVIDER ARE BLOCKED TOO', async () => {
    await expect(fetch('https://eu.api.anthropic.com/v1/messages')).rejects.toThrow(/WALL 11/)
  })

  it('⚠️ PROVIDER KEYS ARE SCRUBBED — so a client cannot be built even with a key in the environment', () => {
    // Proven under a run that exported ANTHROPIC_API_KEY and OPENAI_API_KEY into the vitest process:
    // the test still saw ABSENT. That is what makes the guard survive a future dotenv addition.
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_AI_API_KEY']) {
      expect(process.env[k], k + ' is visible to a unit test').toBeUndefined()
    }
  })

  it('⚠️ A KEY PUT BACK MID-SUITE IS SCRUBBED AGAIN BEFORE THE NEXT TEST', () => {
    // `vi.stubEnv`, a stray assignment, or a module setting a default on import can reintroduce one.
    // A guard that holds only at startup holds until the first test that matters. The `beforeEach` in
    // vitest.setup.ts is what makes this pass, and this is the test that would catch its removal.
    process.env.ANTHROPIC_API_KEY = 'put-back-by-a-previous-test'
    expect(process.env.ANTHROPIC_API_KEY).toBe('put-back-by-a-previous-test')
    // …and the assertion that matters is in the NEXT test, below.
  })

  it('⚠️ A MODULE THAT CAPTURES A KEY AT IMPORT TIME SEES NOTHING — the setup-time scrub, falsifiable', () => {
    /**
     * The `beforeEach` scrub cannot cover this: a statically-imported module runs BEFORE any hook.
     * `base-agent.ts:53` and several route modules capture the key exactly this way, so without the
     * setup-time scrub a client could still be built with a live key from CI secrets.
     *
     * Added because the mutation check found the setup-time scrub untested: removing it stayed GREEN,
     * since the per-test hook masked it. Two scrubs that look redundant, one of which was unverified.
     */
    expect(KEY_SEEN_AT_IMPORT, 'a module read ANTHROPIC_API_KEY at import time').toBeNull()
    expect(OPENAI_KEY_SEEN_AT_IMPORT, 'a module read OPENAI_API_KEY at import time').toBeNull()
  })

  it('…and the next test sees it gone', () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
  })
})

describe('M18B phase 3 · the guard is wired, and the one thing that must never be added', () => {
  const root = join(__dirname, '..', '..')
  const raw = readFileSync(join(root, 'vitest.config.ts'), 'utf8')
  /**
   * ⚠️ COMMENTS STRIPPED BEFORE MATCHING, and my first version did not — so the dotenv assertion below
   * fired on the warning comment I had just written into `vitest.config.ts` explaining why dotenv must
   * never be added. Exactly the failure M18's one-exit guard hit on its own documentation. A scan that
   * reads prose as code gets loosened until it stops firing at all.
   */
  const config = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('vitest.config.ts loads the setup file', () => {
    // Not a presence test standing alone — every assertion above already proves the guard RUNS. This
    // one catches the specific regression of someone removing the wiring while the file stays.
    expect(config).toContain("setupFiles: ['./vitest.setup.ts']")
  })

  it('⚠️ AND IT STILL DOES NOT LOAD dotenv — the one commit that would arm every test at once', () => {
    // The scrub in the setup means even this would not hand out keys any more, which is the point of
    // having both. But the config gaining a dotenv loader is still the moment to stop and think, so it
    // is worth a red test rather than a comment.
    expect(config).not.toMatch(/dotenv|loadEnv|\.env\.local/)
  })
})
