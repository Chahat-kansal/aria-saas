/**
 * M18B PHASE 3 FIXTURE — reads a provider key AT MODULE IMPORT TIME.
 *
 * ⚠️ WHY THIS EXISTS. `vitest.setup.ts` scrubs provider keys twice: once at setup, and again in a
 * `beforeEach`. The mutation check showed that removing the setup-time scrub changed nothing, because
 * the `beforeEach` covered it — so the two looked redundant and one of them was untested.
 *
 * They are not redundant. A module that captures a key when it is IMPORTED runs before any
 * `beforeEach`, and there are real ones in this repo (`base-agent.ts:53` builds its client from
 * `process.env.ANTHROPIC_API_KEY` as an instance field; several route modules do it at module scope).
 * This fixture is the smallest honest stand-in for that pattern, and the test that statically imports
 * it is what makes the setup-time scrub falsifiable.
 */
export const KEY_SEEN_AT_IMPORT = process.env.ANTHROPIC_API_KEY ?? null
export const OPENAI_KEY_SEEN_AT_IMPORT = process.env.OPENAI_API_KEY ?? null
