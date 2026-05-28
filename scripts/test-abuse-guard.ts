// Run: npx tsx scripts/test-abuse-guard.ts
import { checkAbuseRegex } from '../src/lib/community/abuse-guard'

const CASES: { name: string; text: string; expect: 'block' | 'pass' }[] = [
  // Threats — verb+object must hit, bare verb must pass
  { name: 'kill you', text: 'i will kill you', expect: 'block' },
  { name: 'kill the music', text: 'can you kill the music a bit', expect: 'pass' },
  { name: 'find you', text: "i'll find you", expect: 'block' },
  { name: 'burn down the shop', text: 'i will burn down the shop', expect: 'block' },
  { name: 'destroy your business', text: 'im going to destroy your business', expect: 'block' },
  { name: 'ruin (bare)', text: 'this could ruin the cake', expect: 'pass' },
  // Slurs
  { name: 'slur', text: 'you absolute r3tard'.replace('3', 'e'), expect: 'block' },
  // Profanity
  { name: 'profanity', text: 'this is fucking rubbish service', expect: 'block' },
  // Harassment — needs accusation + intensifier
  { name: 'angry scam accusation', text: 'you fucking scammers', expect: 'block' },
  { name: 'neutral scam question', text: 'is this a scam or legit?', expect: 'pass' },
  // Normal chat
  { name: 'normal 1', text: 'hi is this still available?', expect: 'pass' },
  { name: 'normal 2', text: 'can i pick it up saturday morning', expect: 'pass' },
  { name: 'normal 3', text: 'love this place, see you soon', expect: 'pass' },
]

let pass = 0, fail = 0
for (const c of CASES) {
  const r = checkAbuseRegex(c.text)
  const got = r.blocked ? 'block' : 'pass'
  if (got === c.expect) { pass++; console.log(`✓ ${c.name} → ${got}${r.rule ? ' [' + r.rule + ']' : ''}`) }
  else { fail++; console.log(`✗ ${c.name} → got ${got} expected ${c.expect}  («${c.text}»)`) }
}
console.log(`\n${pass}/${CASES.length} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)