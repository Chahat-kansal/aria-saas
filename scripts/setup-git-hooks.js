#!/usr/bin/env node
// LOCAL-GATE-1 — installs scripts/git-hooks/pre-push into .git/hooks/pre-push. Run automatically
// by `npm install` via package.json's "prepare" script. .git/hooks/ is never tracked by git,
// which is why the hook's real source of truth lives at scripts/git-hooks/pre-push (tracked)
// and gets copied into place here on every install.

const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const gitDir = path.join(repoRoot, '.git')

if (!fs.existsSync(gitDir)) {
  // Not a git checkout (e.g. installed as a dependency elsewhere) — nothing to hook into.
  process.exit(0)
}

const hooksDir = path.join(gitDir, 'hooks')
fs.mkdirSync(hooksDir, { recursive: true })

const src = path.join(repoRoot, 'scripts', 'git-hooks', 'pre-push')
const dest = path.join(hooksDir, 'pre-push')

fs.copyFileSync(src, dest)
fs.chmodSync(dest, 0o755)

console.log('[setup-git-hooks] pre-push hook installed — runs canon-rail-guard + tsc on every push.')
console.log('[setup-git-hooks] bypass with `git push --no-verify` (deliberate escape hatch, not recommended).')
