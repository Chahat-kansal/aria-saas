import { defineConfig } from 'vitest/config'
import path from 'path'

// INFRA-UNITTEST-1 — unit runner for logic that has already been proven by hand and then thrown
// away. PROMO-STACK-1 produced a correct before/after table showing stacks_with_others works, then
// deleted it, so the next edit to discount-engine.ts could reintroduce the exact bug with
// everything still green. This config exists so that evidence survives.
//
// ⚠ THE BOUNDARY THAT MATTERS: Vitest and Playwright both define `test`/`expect` globals. If Vitest
// collects the Playwright suites it runs them with no browser and reports failures that are not
// real. Verified before writing this: all 20 Playwright files are .spec.ts and there were zero
// .test.ts files anywhere in the repo, so the extension split below is a clean, checkable boundary
// rather than a convention we hope holds. e2e/ and tests/ are excluded by path as well — belt and
// braces, because a single .test.ts appearing in either directory would otherwise be collected.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'e2e/**', 'tests/**', '**/*.spec.ts'],
    environment: 'node',
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
