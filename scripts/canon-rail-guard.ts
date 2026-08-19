// CANON-RAIL-1 — the enforcement rail's CI guard.
//
// Every prior fix in this codebase (getRevenueSnapshot, get-bid.ts, resolveOwnerBusinessId.ts,
// ComputeResult/Provenance) built a correct, importable canonical helper and stopped there —
// adoption never exceeded ~9-15% (see ARIA-ARCHAEOLOGY-1-REPORT.md) because nothing FORCED a new
// file to use it. This script is that missing forcing mechanism for CI: it fails the build when a
// diff ADDS a new instance of one of the three known-wrong patterns, while leaving the ~329
// pre-existing instances untouched (grandfathered — migrating them is a separate sprint, not this
// guard's job). Only NEW lines in the diff are scanned, never the whole repo.
//
// Patterns blocked:
//   1. A new file-local business-id resolver (`function getBid(...)`, `getBusinessId`, `getBiz`,
//      in function or const-arrow form) — use withBusinessContext (src/lib/api/with-error-capture.ts)
//      or import resolveOwnerBusinessId (src/lib/community/resolveOwnerBusinessId.ts) instead.
//   2. `.neq('status', 'voided')` on any query — the wrong RULE 6 filter; use `.eq('status',
//      'completed')`, or better, getRevenueSnapshot()/getRevenueForRange() for revenue figures.
//   3. A hand-rolled revenue sum (`.reduce(` over a `total_amount` field) in a file outside the
//      canonical compute layer — use getRevenueSnapshot()/getRevenueForRange() instead.
//   4. SECURITY-P5 — a new/modified supabase/migrations/*.sql file that creates a SECURITY
//      DEFINER function with no REVOKE anywhere in the same file. Postgres grants EXECUTE to
//      PUBLIC by default on function creation; this is the exact root cause behind all 24
//      anon/authenticated-executable DEFINER functions SECURITY-P5 found and closed
//      (loyalty_preload_*, credit_image_credits, decrement_numeric/increment_numeric's dynamic-
//      SQL arbitrary-column primitive, create_product_draft's cross-tenant injection gap, etc.
//      — see supabase/migrations/202607270{1,2,3,4}0000_security_p5_tier*.sql). A migration
//      that creates a DEFINER function must explicitly REVOKE EXECUTE FROM PUBLIC/anon (and
//      authenticated, unless the function is genuinely self-guarding via auth.uid()) in the
//      same file — this rule fails the build if it doesn't, before the gap ever reaches prod.
//
// Usage:
//   npx tsx scripts/canon-rail-guard.ts                  # CI default: diff origin/main...HEAD
//   npx tsx scripts/canon-rail-guard.ts --base=<ref>      # diff against a specific ref
//   npx tsx scripts/canon-rail-guard.ts --working-tree    # diff uncommitted tracked/intent-to-add changes (local dev)
//
// Exit code 0 = no new violations. Exit code 1 = at least one new violation (printed to stdout).

import { execSync } from 'node:child_process'

const EXEMPT_PATHS = [
  'src/lib/community/resolveOwnerBusinessId.ts', // the canonical resolver itself
  'src/lib/auth/get-bid.ts',                     // pre-existing resolver, retirement is a separate migration sprint
  'src/lib/api/with-error-capture.ts',           // the rail itself calls resolveOwnerBusinessId
  'src/lib/aria/revenue-snapshot.ts',            // the canonical revenue compute layer
  'src/lib/aria/compute/',                       // the canonical compute layer
  'scripts/canon-rail-guard.ts',                 // this file quotes the patterns it blocks
  // MS7 phase 5 — the two comms chokepoints ARE the rail; they are the only files allowed to
  // call the provider directly. Everything else must go through sendSMS() / sendWhatsApp().
  'src/lib/clicksend.ts',
  'src/lib/whatsapp.ts',
]

interface Violation {
  file: string
  line: number
  rule: string
  text: string
}

function isExempt(file: string): boolean {
  return EXEMPT_PATHS.some(p => file === p || file.startsWith(p))
}

function getDiff(): string {
  const args = process.argv.slice(2)
  const workingTree = args.includes('--working-tree')
  const baseArg = args.find(a => a.startsWith('--base='))
  const base = baseArg ? baseArg.slice('--base='.length) : 'origin/main'

  if (workingTree) {
    // Include brand-new untracked files as additions (git ignores untracked files in a plain
    // `git diff` otherwise) — intent-to-add stages them as empty so the real diff shows as 100% new.
    try { execSync('git add -N .', { stdio: 'ignore' }) } catch { /* best-effort */ }
    return execSync('git diff --unified=0 -- "*.ts" "*.tsx" "supabase/migrations/*.sql"', { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
  }

  return execSync(`git diff --unified=0 ${base}...HEAD -- "*.ts" "*.tsx" "supabase/migrations/*.sql"`, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
}

function scan(diff: string): Violation[] {
  const violations: Violation[] = []
  let currentFile: string | null = null
  let newLineNo = 0
  // Track added lines per-file for the cross-line "revenue sum" heuristic (rule 3 needs both a
  // total_amount reference AND a .reduce( call somewhere in the same file's new lines).
  const addedLinesByFile = new Map<string, Array<{ line: number; text: string }>>()

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).replace(/^b\//, '')
      currentFile = path === '/dev/null' ? null : path
      continue
    }
    if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)/)
      newLineNo = m ? parseInt(m[1], 10) : 0
      continue
    }
    const isSql = currentFile?.endsWith('.sql') ?? false
    const isTs = currentFile?.endsWith('.ts') || currentFile?.endsWith('.tsx')
    if (!currentFile || isExempt(currentFile)) continue
    if (!isTs && !isSql) continue
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      const text = raw.slice(1)

      if (isTs) {
        if (/\b(async\s+)?function\s+(getBid|getBusinessId|getBiz)\s*\(/.test(text) ||
            /\bconst\s+(getBid|getBusinessId|getBiz)\s*[:=]/.test(text)) {
          violations.push({ file: currentFile, line: newLineNo, rule: 'inline-business-id-resolver', text: text.trim() })
        }

        if (/\.neq\(\s*['"]status['"]\s*,\s*['"]voided['"]\s*\)/.test(text)) {
          violations.push({ file: currentFile, line: newLineNo, rule: 'neq-voided-filter', text: text.trim() })
        }

        // MS7 phase 5 — NO NEW DIRECT CALLS TO THE SMS PROVIDER.
        //
        // src/lib/clicksend.ts's sendSMS() is the single SMS chokepoint: it checks per-channel
        // sms_consent, honours the sms_suppression opt-out list, appends the STOP notice to
        // marketing, and writes every attempt (sent/skipped/failed) to sms_send_log. 45 files
        // import it and, as of MS7 phase 4, NOT ONE bypasses it.
        //
        // This rule exists because the rail working today is not the same as the rail working
        // tomorrow. The email side already learned this: a raw fetch around sendEmail() in the CX
        // digest meant no unsubscribe and no suppression check ever ran, and nothing caught it.
        // A new fetch to rest.clicksend.com would reintroduce exactly that, and the send would
        // look completely normal — the only visible difference is an absent sms_send_log row.
        //
        // Scoped to ADDED lines only, like every other rule here, so the two chokepoints and all
        // existing code are untouched.
        if (/rest\.clicksend\.com|api\.clicksend\.com/.test(text)) {
          violations.push({ file: currentFile, line: newLineNo, rule: 'direct-sms-provider-call', text: text.trim() })
        }
      }

      const arr = addedLinesByFile.get(currentFile) ?? []
      arr.push({ line: newLineNo, text })
      addedLinesByFile.set(currentFile, arr)

      newLineNo++
    } else if (!raw.startsWith('-')) {
      newLineNo++
    }
  }

  // Rule 3 — ad-hoc revenue sum: both a total_amount reference AND a .reduce( call newly added
  // to the same file. Conservative on purpose (two independent signals, not one) to avoid flagging
  // a line that merely displays/reads total_amount without summing it.
  for (const [file, lines] of addedLinesByFile) {
    const hasTotalAmount = lines.some(l => /total_amount/.test(l.text))
    const reduceLine = lines.find(l => /\.reduce\(/.test(l.text))
    if (hasTotalAmount && reduceLine) {
      violations.push({ file, line: reduceLine.line, rule: 'ad-hoc-revenue-sum', text: reduceLine.text.trim() })
    }
  }

  // Rule 4 — SECURITY-P5: a migration creates a SECURITY DEFINER function but never REVOKEs
  // EXECUTE in the same file. Postgres grants EXECUTE to PUBLIC by default on function creation,
  // so "create, forget to revoke" ships wide open by default — this was the root cause of every
  // finding in SECURITY-P5. Two independent signals (CREATE FUNCTION...SECURITY DEFINER present,
  // REVOKE absent) in the same file's new lines, same conservative shape as rule 3.
  for (const [file, lines] of addedLinesByFile) {
    if (!file.endsWith('.sql')) continue
    const definerLine = lines.find(l => /security\s+definer/i.test(l.text))
    const hasRevoke = lines.some(l => /\brevoke\b/i.test(l.text))
    if (definerLine && !hasRevoke) {
      violations.push({ file, line: definerLine.line, rule: 'definer-function-missing-revoke', text: definerLine.text.trim() })
    }
  }

  return violations
}

function main() {
  let diff: string
  try {
    diff = getDiff()
  } catch (e) {
    console.error('[canon-rail-guard] failed to compute git diff:', (e as Error).message)
    process.exit(1)
  }

  const violations = scan(diff)

  if (violations.length === 0) {
    console.log('[canon-rail-guard] no new canonical-path violations introduced. Pass.')
    process.exit(0)
  }

  console.error(`[canon-rail-guard] ${violations.length} new violation(s) found — these are NEW lines only, pre-existing code is grandfathered:\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]\n    ${v.text}\n`)
  }
  console.error('Fix: use withBusinessContext (src/lib/api/with-error-capture.ts) instead of a local getBid/getBusinessId/getBiz;')
  console.error('use .eq(\'status\',\'completed\') or getRevenueSnapshot()/getRevenueForRange() instead of neq(\'voided\')/a hand-rolled sum;')
  console.error('add REVOKE EXECUTE ... FROM PUBLIC, anon[, authenticated] in the same migration file as any new SECURITY DEFINER function;')
  console.error("send SMS with sendSMS() from src/lib/clicksend.ts (pass category: 'marketing' for anything promotional) rather than")
  console.error('calling rest.clicksend.com directly — the chokepoint is what checks sms_consent, honours the opt-out list, appends')
  console.error('the STOP notice and writes the sms_send_log audit row. A raw fetch does none of those and looks identical when sent.')
  process.exit(1)
}

main()
