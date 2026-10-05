import { beforeEach, expect } from 'vitest'

/**
 * M18B · PHASE 3 — A UNIT TEST CANNOT SPEND MONEY. THE GUARANTEE, REPLACING AN ACCIDENT.
 *
 * ⚠️ WHAT WAS TRUE BEFORE THIS FILE EXISTED, measured by probe rather than assumed:
 *
 *     ANTHROPIC_API_KEY=ABSENT | GEMINI_API_KEY=ABSENT | OPENAI_API_KEY=ABSENT
 *     SUPABASE_SERVICE_ROLE_KEY=ABSENT | fetch=function
 *
 * The 1,841-test suite was free of charge **because no key was loaded** — not because anything
 * stopped it. `vitest.config.ts` had no `setupFiles`, nothing loaded `.env.local`, and a provider
 * client built in a test got `apiKey: undefined` and threw before reaching the network.
 *
 * **That is an accident, and one plausible commit away from vanishing.** Adding `setupFiles` with
 * `dotenv` — an obvious convenience, exactly the sort of thing added to make one integration test
 * work — would have handed live keys to every test in the repo at once. `fetch` was already a live
 * function with no guard in front of it.
 *
 * So this file does two things, and the second is the one that still works after someone adds dotenv:
 *
 *   1 · **SCRUBS the model-provider keys** from `process.env`, so a client cannot be constructed with
 *       one even if the environment supplies it (CI secrets, a future `setupFiles` addition, a shell
 *       export).
 *   2 · **BLOCKS `fetch` to provider hosts**, so a client built with a hard-coded or inlined key still
 *       cannot reach anyone. The failure names the test file, because "something tried to call
 *       Anthropic" across 146 files is not a diagnosis.
 *
 * ⚠️ IT BLOCKS PROVIDER HOSTS ONLY, NOT ALL NETWORKING. A blanket `fetch` ban would fail tests that
 * legitimately stub or call non-provider URLs, and a guard people have to disable to get work done is
 * the kind that gets disabled permanently.
 *
 * ⚠️ SUPABASE KEYS ARE DELIBERATELY NOT SCRUBBED. They are not a spend risk, tests mock the client,
 * and removing them could change behaviour in an environment that legitimately provides them. This
 * guard is about money.
 *
 * ⚠️ `check:live` IS NOT AFFECTED. It runs under Playwright with its own config and never loads this
 * file — its whole job is to be live, once per sprint. `ARIA_ALLOW_LIVE_MODELS=1` exists for the rare
 * case where a vitest test must genuinely reach a provider; nothing in CI sets it.
 */

/** Hosts that cost money. Matched on hostname, so a path change cannot slip past. */
const PROVIDER_HOSTS = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'aiplatform.googleapis.com',
  'api.mistral.ai',
  'api.cohere.ai',
  'api.groq.com',
  'openrouter.ai',
  'api.deepseek.com',
  'api.x.ai',
]

/**
 * Env vars that let a client be built at all. Scrubbed unless the escape hatch is set.
 *
 * ⚠️ NOT A KEY VALUE IN SIGHT, AND THAT IS A RULE: this sprint forbids printing a key, a fragment, or
 * even a length. The list below is variable NAMES, and the guard never reads, logs or compares a value.
 */
const PROVIDER_KEY_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_AI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'MISTRAL_API_KEY',
  'COHERE_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'DEEPSEEK_API_KEY',
  'XAI_API_KEY',
]

/** The one deliberate escape hatch. Nothing in CI sets it; `check:live` does not need it. */
export const LIVE_MODELS_ALLOWED = process.env.ARIA_ALLOW_LIVE_MODELS === '1'

function hostOf(input: unknown): string | null {
  try {
    if (typeof input === 'string') return new URL(input).hostname
    if (input instanceof URL) return input.hostname
    if (input && typeof input === 'object' && 'url' in input) {
      return new URL(String((input as { url: unknown }).url)).hostname
    }
  } catch {
    // A relative or malformed URL cannot be a provider host, so it is not this guard's business.
  }
  return null
}

/** Which test is running, so the failure names a file rather than a suite. */
function currentTestFile(): string {
  try {
    const state = expect.getState() as { testPath?: string; currentTestName?: string }
    const path = state.testPath ? String(state.testPath).replace(/\\/g, '/').replace(/^.*?\/(src|tests)\//, '$1/') : 'unknown file'
    return state.currentTestName ? path + ' › ' + state.currentTestName : path
  } catch {
    return 'unknown file'
  }
}

if (!LIVE_MODELS_ALLOWED) {
  for (const name of PROVIDER_KEY_VARS) delete process.env[name]

  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    const host = hostOf(input)
    if (host && PROVIDER_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
      throw new Error(
        'M18B WALL 11 — a unit test tried to reach a LIVE MODEL PROVIDER (' + host + ').\n'
        + '  in: ' + currentTestFile() + '\n'
        + '  Unit tests must never spend money. Mock the provider, or the module that calls it —\n'
        + '  every existing test in this repo does (see e.g. src/lib/ai-router-breaker.test.ts).\n'
        + '  `npm run check:live` is where real calls belong: once per sprint, on purpose.\n'
        + '  Deliberate exception, used by nothing in CI: ARIA_ALLOW_LIVE_MODELS=1',
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return realFetch(input as any, init as any)
  }) as typeof globalThis.fetch
}

/**
 * ⚠️ RE-SCRUBBED BEFORE EVERY TEST, because `vi.stubEnv`, a stray assignment, or a module that sets a
 * default on import can put a key back between tests. A guard that holds only at startup is a guard
 * that holds until the first test that matters.
 */
beforeEach(() => {
  if (LIVE_MODELS_ALLOWED) return
  for (const name of PROVIDER_KEY_VARS) {
    if (process.env[name] !== undefined) delete process.env[name]
  }
})
