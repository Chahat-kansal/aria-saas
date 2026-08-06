// SEC-MGR-1 — choose WHICH manager authorised an override.
//
// THE BUG: manager-verify fetched the eligible managers with .maybeSingle() and compared the
// entered PIN against whichever single row came back. Two defects in one line:
//   1. .maybeSingle() over a set that can hold many rows — PostgREST errors, data is null, and
//      every override fails "Invalid PIN". Loud, but misattributed: it reads as a PIN problem.
//   2. even resolved, manager B's correct PIN was checked against manager A's stored hash, so B
//      could never authorise anything.
//
// ⚠ WHY .limit(1) IS THE WRONG FIX — and it is the tempting one, because the `businesses` query
// two lines above already uses it: .limit(1) silences defect 1 and LEAVES defect 2. A hard,
// visible failure becomes a wrong-person failure that looks like a staff member mistyping their
// PIN. Quieter and worse.
//
// PINs are bcrypt-hashed (SEC-PIN-1/2), so the PIN cannot go in the WHERE clause — hashes are not
// searchable. Fetching every eligible row and verifying against each is the only correct shape.

/** Bound on how many managers we will bcrypt-verify in one request. bcrypt is deliberately slow
 *  (~100ms), so N managers costs N × that. A café has one or two; an unbounded loop behind an
 *  authorisation endpoint is worth bounding regardless. Exceeding it is reported, not silently
 *  truncated — see the caller. */
export const MAX_MANAGER_CANDIDATES = 20

export interface ManagerRow {
  id: string
  name?: string | null
  role?: string | null
  pin?: string | null
  pin_hash?: string | null
}

/**
 * Return the manager whose PIN matches, or null.
 *
 * `verify` is injected so this stays pure and testable, and so the comparison itself is not
 * reimplemented here — SEC-PIN-2 exists precisely because this route diverged from verify-pin once
 * already. The caller passes the shared verifyStaffPin.
 *
 * DETERMINISTIC: candidates are sorted by id before iterating, so two managers sharing a PIN always
 * resolve to the same person rather than whichever row Postgres happened to return first. An
 * authorisation record that changes with row order is not a record.
 */
export async function pickMatchingManager(
  rows: ManagerRow[],
  pin: string,
  verify: (pin: string, hash: string | null | undefined) => Promise<boolean>,
): Promise<ManagerRow | null> {
  const candidates = [...(rows ?? [])]
    .filter(Boolean)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .slice(0, MAX_MANAGER_CANDIDATES)

  for (const row of candidates) {
    if (row.pin_hash) {
      if (await verify(pin, row.pin_hash)) return row
      continue
    }
    // Legacy fallback for a row not yet upgraded — same shape as verify-pin's. The caller performs
    // the upgrade on a successful match; this function only decides.
    if (row.pin != null && String(row.pin) === pin) return row
  }

  return null
}
