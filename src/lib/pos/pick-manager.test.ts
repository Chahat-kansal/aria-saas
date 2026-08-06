import { describe, it, expect } from 'vitest'
import { pickMatchingManager, MAX_MANAGER_CANDIDATES, type ManagerRow } from '@/lib/pos/pick-manager'

// SEC-MGR-1 §3 — the manager-override matcher.
//
// The assertion that matters is "three managers, the third one's PIN". That is defect 2: the old
// code compared the entered PIN against ONE arbitrary row, so manager B's correct PIN was checked
// against manager A's hash and B could never authorise anything. .limit(1) would have silenced the
// crash and left exactly that behaviour.

/** Stand-in for bcrypt: hash of "NNNN" is "h:NNNN". Keeps the test about SELECTION, not crypto —
 *  verifyStaffPin has its own suite in staff-pin.test.ts. */
const verify = async (pin: string, hash: string | null | undefined) => hash === 'h:' + pin

const mgr = (id: string, pin: string, name = id): ManagerRow =>
  ({ id, name, role: 'manager', pin: null, pin_hash: 'h:' + pin })

describe('pickMatchingManager', () => {
  it('one manager, correct PIN → that manager', async () => {
    const out = await pickMatchingManager([mgr('a', '1111')], '1111', verify)
    expect(out?.id).toBe('a')
  })

  it('one manager, wrong PIN → null', async () => {
    expect(await pickMatchingManager([mgr('a', '1111')], '2222', verify)).toBeNull()
  })

  // ── DEFECT 2, THE POINT OF THE SPRINT ────────────────────────────────────────────────────────
  it('three managers, the THIRD one’s PIN → the third manager', async () => {
    const rows = [mgr('a', '1111', 'Alice'), mgr('b', '2222', 'Bob'), mgr('c', '3333', 'Cara')]
    const out = await pickMatchingManager(rows, '3333', verify)
    expect(out?.id).toBe('c')
    // The NAME matters as much as the id: it is shown to the cashier as who authorised the
    // override. Returning the wrong one is a false audit record, not a cosmetic bug.
    expect(out?.name).toBe('Cara')
  })

  it('three managers, the SECOND one’s PIN → the second manager', async () => {
    const rows = [mgr('a', '1111'), mgr('b', '2222'), mgr('c', '3333')]
    expect((await pickMatchingManager(rows, '2222', verify))?.id).toBe('b')
  })

  it('three managers, a PIN none of them has → null', async () => {
    const rows = [mgr('a', '1111'), mgr('b', '2222'), mgr('c', '3333')]
    expect(await pickMatchingManager(rows, '9999', verify)).toBeNull()
  })

  it('zero managers → null, no throw', async () => {
    expect(await pickMatchingManager([], '1111', verify)).toBeNull()
  })

  it('two managers sharing a PIN → deterministic, not dependent on DB row order', async () => {
    // Postgres makes no ordering guarantee without ORDER BY, so the same override must not
    // attribute to a different person between two identical requests.
    const a = await pickMatchingManager([mgr('a', '1111'), mgr('b', '1111')], '1111', verify)
    const b = await pickMatchingManager([mgr('b', '1111'), mgr('a', '1111')], '1111', verify)
    expect(a?.id).toBe(b?.id)
    expect(a?.id).toBe('a')   // sorted by id, so the choice is stable and explainable
  })

  it('falls back to plaintext only when pin_hash is null (un-upgraded row)', async () => {
    const legacy: ManagerRow = { id: 'z', name: 'Zed', pin: '4821', pin_hash: null }
    expect((await pickMatchingManager([legacy], '4821', verify))?.id).toBe('z')
    expect(await pickMatchingManager([legacy], '4822', verify)).toBeNull()
  })

  it('a hashed row is NEVER matched by its stale plaintext column', async () => {
    // If a PIN was changed and the plaintext went stale, the hash is authoritative.
    const row: ManagerRow = { id: 'y', pin: 'OLD9', pin_hash: 'h:NEW1' }
    expect(await pickMatchingManager([row], 'OLD9', verify)).toBeNull()
    expect((await pickMatchingManager([row], 'NEW1', verify))?.id).toBe('y')
  })

  it('caps the candidate set — bcrypt is ~100ms per check', async () => {
    const many = Array.from({ length: 50 }, (_, i) => mgr(String(i).padStart(3, '0'), 'p' + i))
    // The 30th manager is beyond the cap, so their PIN does not authorise.
    expect(await pickMatchingManager(many, 'p30', verify)).toBeNull()
    expect((await pickMatchingManager(many, 'p0', verify))?.id).toBe('000')
    expect(MAX_MANAGER_CANDIDATES).toBe(20)
  })
})
