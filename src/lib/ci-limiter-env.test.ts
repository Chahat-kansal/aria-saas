import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const WORKFLOWS = ['.github/workflows/smoke.yml', '.github/workflows/e2e.yml']

/**
 * A workflow job: its name, its job-level `env:` keys, and its raw block.
 *
 * Line-based rather than a YAML dependency — these files have a fixed two-space job indent, and
 * adding a parser dependency to run one assertion would be its own kind of drift.
 */
interface Job { name: string; env: string[]; block: string }

function jobsOf(yml: string): Job[] {
  const lines = yml.split('\n')
  const jobsAt = lines.findIndex(l => /^jobs:\s*$/.test(l))
  if (jobsAt < 0) return []
  const out: Job[] = []
  let cur: { name: string; start: number } | null = null
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i]!)
    if (m) {
      if (cur) out.push({ name: cur.name, block: lines.slice(cur.start, i).join('\n'), env: [] })
      cur = { name: m[1]!, start: i }
    }
  }
  if (cur) out.push({ name: cur.name, block: lines.slice(cur.start).join('\n'), env: [] })

  for (const j of out) {
    // The job-level env block: `    env:` at 4 spaces, keys at 6.
    const bl = j.block.split('\n')
    const at = bl.findIndex(l => /^ {4}env:\s*$/.test(l))
    if (at < 0) continue
    for (let i = at + 1; i < bl.length; i++) {
      const km = /^ {6}([A-Za-z0-9_]+):/.exec(bl[i]!)
      if (km) { j.env.push(km[1]!); continue }
      if (/^ {0,5}\S/.test(bl[i]!)) break     // dedent — end of the env block
    }
  }
  return out
}

/**
 * S10 PHASE 1 — A CI JOB THAT RUNS ITS OWN WEB SERVER MUST SUPPLY THE LIMITER'S BACKING STORE.
 *
 * ── WHAT HAPPENED ───────────────────────────────────────────────────────────────────────────────
 * `next start` sets NODE_ENV=production, so `src/lib/rate-limit.ts` takes its PRODUCTION branch —
 * and that branch FAILS CLOSED when Upstash is unreachable, deliberately (SECURITY-P1 M-01: a
 * missing env var must never silently strip rate limiting from prod). Both variables are set in
 * Vercel; CI's own web server runs outside Vercel and nothing passed them in. So every limited
 * route returned 429 on its FIRST call, and the suite reported "Too many attempts" — which was not
 * a count at all, but a limiter with nowhere to count.
 *
 * That is the FOURTH consecutive infrastructure layer to block this suite (lockfile → selector →
 * password → limiter store), and not one of them was Ask Aria.
 *
 * ── THE RULE, NOT THE INSTANCE ──────────────────────────────────────────────────────────────────
 * A job pointing at `localhost:3000` is running its own server and therefore its own copy of the
 * limiter. A job pointing at production is served by Vercel, which already has these. So the test
 * keys off BASE_URL rather than off a hardcoded list of job names.
 */
describe('S10 phase 1 · the limiter reaches every CI web server', () => {
  const all = WORKFLOWS.flatMap(f => jobsOf(read(f)).map(j => ({ file: f, ...j })))

  it('ANTI-VACUITY — the workflow parser actually found jobs and their env keys', () => {
    // A parser that silently returns [] would make every assertion below pass while proving
    // nothing. This repo has produced that failure in its own tooling more than once.
    expect(all.length, 'no jobs parsed from the workflows').toBeGreaterThanOrEqual(4)
    expect(all.map(j => j.name).sort()).toEqual(['e2e-local', 'smoke', 'test', 'typecheck'])
    const withEnv = all.filter(j => j.env.length > 0)
    expect(withEnv.length, 'no job env blocks parsed').toBeGreaterThanOrEqual(3)
    expect(all.find(j => j.name === 'smoke')!.env).toContain('TEST_USER_EMAIL')
  })

  it('THE RAIL — every job serving localhost passes both Upstash variables', () => {
    const local = all.filter(j => /BASE_URL:\s*http:\/\/localhost:3000/.test(j.block))
    expect(local.length, 'no localhost-serving job found — the scan is broken, not the workflows')
      .toBeGreaterThanOrEqual(2)

    const missing = local.filter(j =>
      !j.env.includes('UPSTASH_REDIS_REST_URL') || !j.env.includes('UPSTASH_REDIS_REST_TOKEN'))
    expect(missing.map(j => j.file + ':' + j.name),
      'jobs running their own server without the limiter store').toEqual([])
  })

  it('the production job is deliberately NOT given them — Vercel already has them', () => {
    const prod = all.find(j => j.name === 'test')!
    expect(prod.block).toMatch(/BASE_URL:\s*https:\/\/www\.ariaos\.site/)
    expect(prod.env).not.toContain('UPSTASH_REDIS_REST_URL')
  })

  it('NO SECRET VALUE IS EVER PRINTED — presence is asserted, never content', () => {
    for (const f of WORKFLOWS) {
      const y = read(f)
      // The only thing echoed about a secret is a character count, which is the existing
      // convention in this file and is not a fragment of the value.
      expect(y).not.toMatch(/echo\s+"?\$\{?\{?\s*secrets\./)
      expect(y).not.toMatch(/echo .*\$UPSTASH_REDIS_REST_(URL|TOKEN)\b/)
    }
    // and the values themselves are never committed
    const smoke = read('.github/workflows/smoke.yml')
    expect(smoke).toMatch(/UPSTASH_REDIS_REST_URL: \$\{\{ secrets\.UPSTASH_REDIS_REST_URL \}\}/)
    expect(smoke).not.toMatch(/UPSTASH_REDIS_REST_URL:\s*https?:\/\//)
  })

  it('the smoke suite fails fast on a missing secret rather than 40 minutes later', () => {
    const smoke = read('.github/workflows/smoke.yml')
    expect(smoke).toMatch(/check UPSTASH_REDIS_REST_URL/)
    expect(smoke).toMatch(/check UPSTASH_REDIS_REST_TOKEN/)
  })

  it('MUTATION PROBE — removing a variable from a localhost job goes red', () => {
    const smoke = read('.github/workflows/smoke.yml')
    const mutated = smoke.replace(
      /\s*UPSTASH_REDIS_REST_TOKEN: \$\{\{ secrets\.UPSTASH_REDIS_REST_TOKEN \}\}/, '')
    expect(mutated, 'the mutation did not apply — the probe proves nothing').not.toBe(smoke)
    const j = jobsOf(mutated).find(x => x.name === 'smoke')!
    expect(j.env).not.toContain('UPSTASH_REDIS_REST_TOKEN')
    expect(jobsOf(smoke).find(x => x.name === 'smoke')!.env).toContain('UPSTASH_REDIS_REST_TOKEN')
  })
})
