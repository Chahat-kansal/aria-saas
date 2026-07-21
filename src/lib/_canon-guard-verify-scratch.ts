// SECURITY-RESIDUE-FIX-1 PART 2 VERIFY — temporary scratch file, deleted in the very next commit.
// Deliberately reintroduces the exact forbidden pattern canon-rail-guard.ts blocks, to prove the
// new push trigger actually fires and actually fails on a real GitHub Actions run (not just locally).
function getBid(userId: string) {
  return userId
}
