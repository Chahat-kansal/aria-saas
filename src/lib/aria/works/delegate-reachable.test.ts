import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const AX = read('src/components/ask-aria-ax/AskAriaTransition.tsx')

/**
 * M12 PHASE 6 — DELEGATE, ON THE SCREEN THE OWNER ACTUALLY STARTS FROM.
 *
 * M11B built plan → approve → execute → report and put the Delegate control in the WORKING
 * composer only — the one you see after you have already sent a message. **The welcome screen had
 * none**, and that is where a fresh conversation begins. `aria_plans` has 0 rows.
 *
 * This is the `/ax` shape again: four sprints of work behind a door nobody opens. The owner who
 * typed "Tidy up before the weekend" was on the welcome screen, where the placeholder literally
 * reads "Ask Aria anything, or tell her to do it…" — and there was no way to tell her to do it.
 */
describe('M12 phase 6 · both composers can delegate', () => {
  it('ANTI-VACUITY — the surface was read and still has both composers', () => {
    expect(AX.length).toBeGreaterThan(30_000)
    expect(AX).toContain('className="bigask"')     // welcome
    expect(AX).toContain('className="write"')      // working
  })

  it('the WELCOME composer has a Delegate control', () => {
    const bigask = AX.slice(AX.indexOf('className="bigask"'), AX.indexOf('className="ropemini"'))
    expect(bigask).toContain('void delegate(welcomeInput)')
    expect(bigask).toContain('aria-label="Delegate this as a job"')
  })

  it('the WORKING composer still has its own — nothing was moved', () => {
    // RULE 0: this phase adds a second entry point, it does not relocate the first.
    expect(AX).toContain('void delegate(input)')
    expect(AX).toContain('🗂 Delegate')
  })

  it('both call the SAME callback — one delegation path, not two', () => {
    // Two code paths to a plan is how the two start disagreeing about what a plan is.
    expect((AX.match(/void delegate\(/g) ?? []).length).toBe(2)
    expect((AX.match(/const delegate = useCallback/g) ?? []).length).toBe(1)
  })

  it('the welcome control is disabled on an empty box, and while planning or streaming', () => {
    const bigask = AX.slice(AX.indexOf('className="bigask"'), AX.indexOf('className="ropemini"'))
    expect(bigask).toContain('disabled={planning || isBusy || !welcomeInput.trim()}')
  })

  it('it says what it does, and that nothing runs — the promise the sprint is about', () => {
    const bigask = AX.slice(AX.indexOf('className="bigask"'), AX.indexOf('className="ropemini"'))
    expect(bigask).toContain('Nothing runs until you approve')
  })

  it('MUTATION — removing the welcome control puts Delegate back behind the first message', () => {
    const mutated = AX.replace('void delegate(welcomeInput)', 'void ask(welcomeInput)')
    expect(mutated).not.toBe(AX)
    expect(mutated).not.toContain('void delegate(welcomeInput)')
    // And the count of delegation entry points drops back to the one M11B shipped.
    expect((mutated.match(/void delegate\(/g) ?? []).length).toBe(1)
  })
})
