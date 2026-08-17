// ARIA-MERGE-FIX-1 — turn a merge_pos_customers_atomic failure into an HTTP response.
//
// EXTRACTED SO IT CANNOT BE SKIPPED SILENTLY. The bug this sprint fixes was not a hard problem; it
// was `await supabaseAdmin.from(...).update(...)` with the error never destructured, in a route
// where the very next statement soft-deleted the row the failed write was supposed to save. Error
// handling that lives only as an `if` inside a route handler is invisible to the test suite, so it
// is exactly the kind of thing that gets dropped in a refactor and noticed by a café six months
// later. Pulling the mapping out gives it a name, a test, and a mutation check.

export interface MergeErrorResponse {
  status: number
  error: string
}

/** The shape supabase-js hands back on a failed .rpc(). */
export interface MergeRpcError {
  message?: string | null
  code?: string | null
  details?: string | null
}

/**
 * Map an RPC failure to a response. Returns null ONLY when there is no error at all.
 *
 * FAIL CLOSED: anything unrecognised is a 500, never a pass-through. The function is atomic, so a
 * non-null error means the ENTIRE merge rolled back and both customers are intact — reporting
 * success would tell the owner their records were consolidated when nothing happened, which is the
 * same lie in the opposite direction to the original bug.
 */
export function mergeErrorResponse(err: MergeRpcError | null | undefined): MergeErrorResponse | null {
  if (!err) return null

  const message = String(err.message ?? '')

  // Raised by the function itself when either id is missing, or belongs to another business. The
  // business scoping is inside the function too, so this doubles as the cross-tenant refusal.
  if (message.includes('merge_not_found')) {
    return { status: 404, error: 'One or both customers not found' }
  }
  if (message.includes('merge_self')) {
    return { status: 400, error: 'Cannot merge a customer with itself' }
  }

  // 23505. Reachable only if a NEW unique index is added to pos_customers whose predicate does not
  // exclude soft-deleted rows and whose column the merge copies — the shape that made
  // idx_pos_customers_square a second silent failure after the phone one was fixed. Named
  // explicitly so the next person gets a pointer rather than "internal error".
  if (err.code === '23505' || message.includes('duplicate key value')) {
    return {
      status: 409,
      error: 'Merge conflicts with a unique constraint on the surviving customer; nothing was changed',
    }
  }

  return { status: 500, error: message || 'Merge failed' }
}
