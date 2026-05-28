// Quick test runner for the privacy guard.
// Run: npx tsx scripts/test-privacy-guard.ts
import { checkPrivacyRegex, normaliseForGuard } from '../src/lib/community/privacy-guard'

type Case = { name: string; text: string; expect: 'block' | 'pass' }

const CASES: Case[] = [
  // ── Should BLOCK (spelled-out + obfuscated PII) ──────────────────
  { name: 'spelled-out AU mobile',     text: 'call me on oh four one two three four five six seven eight nine', expect: 'block' },
  { name: 'obfuscated email at/dot',   text: 'email me name at gmail dot com', expect: 'block' },
  { name: 'email with parens',         text: 'reach out to me (john (at) gmail (dot) com)', expect: 'block' },
  { name: 'email with brackets',       text: 'me [at] outlook [dot] com if you want', expect: 'block' },
  { name: 'split phone with spaces',   text: 'my number is 0 4 1 2 3 4 5 6 7 8 9', expect: 'block' },
  { name: 'phone with dots',           text: 'ring 0412.345.678 when youre free', expect: 'block' },
  { name: 'phone with dashes',         text: 'phone 0412-345-678 cheers', expect: 'block' },
  { name: 'plain AU mobile',           text: 'just text me on 0412345678', expect: 'block' },
  { name: '+61 international',         text: 'try +61412345678 it works', expect: 'block' },
  { name: 'double in number words',    text: 'its oh four double one two three four five six seven', expect: 'block' },
  { name: 'real email plain',          text: 'sarah@example.com.au', expect: 'block' },
  { name: 'address with street',       text: 'i live at 12 smith street richmond', expect: 'block' },
  { name: 'address with road',         text: 'come by 245 high road tonight', expect: 'block' },
  { name: 'address state postcode',    text: 'we are in carlton vic 3053 if you want to drop in', expect: 'block' },
  { name: 'card number',               text: 'my visa is 4242 4242 4242 4242 just in case', expect: 'block' },
  // ── Should PASS (normal chat) ────────────────────────────────────
  { name: 'simple greeting',           text: 'hi! is this still available?', expect: 'pass' },
  { name: 'ask price',                 text: 'how much for two of these mate?', expect: 'pass' },
  { name: 'arrange in person',         text: 'cool ill swing by tomorrow morning thanks', expect: 'pass' },
  { name: 'three digits only',         text: 'i have $250 budget', expect: 'pass' },
  { name: 'four digits only',          text: 'looking for something under 1500', expect: 'pass' },
  { name: 'mentions a year',           text: 'is the 2021 still available?', expect: 'pass' },
  // ── Edge: "at" used naturally ────────────────────────────────────
  { name: 'at used as preposition',    text: 'see you at the shop later', expect: 'pass' },
  { name: 'one and two words',         text: 'ill take one or two', expect: 'pass' },
]

let failed = 0
let passed = 0
for (const c of CASES) {
  const r = checkPrivacyRegex(c.text)
  const got: 'block' | 'pass' = r.blocked ? 'block' : 'pass'
  const ok = got === c.expect
  if (ok) {
    passed++
    console.log(`✓ ${c.name}  →  ${got}${r.rule ? '  [' + r.rule + ']' : ''}`)
  } else {
    failed++
    console.log(`✗ ${c.name}  →  got ${got} expected ${c.expect}`)
    console.log(`   text:        ${c.text}`)
    console.log(`   normalised:  ${normaliseForGuard(c.text)}`)
    if (r.rule) console.log(`   rule:        ${r.rule}`)
  }
}
console.log(`\n${passed}/${CASES.length} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)