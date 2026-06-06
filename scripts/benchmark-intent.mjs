import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envContent.split('\n')) {
  const eq = line.indexOf('=')
  if (eq > 0 && !line.startsWith('#')) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

const INTENT_SYSTEM = `You are an intent classifier for a business analytics system. Given a user's question, return STRICT JSON only — no prose, no markdown, no explanation.

Schema: {"deliverable":"dashboard|ranked_list|scorecard|comparison|trend|single_answer","subject":"customers|products|staff|days|hours|categories|payment_methods|revenue|margin|none","metric":"revenue|spend|units|count|margin_pct|avg_ticket|none","direction":"top|bottom","timeframe_days":30,"title":"<4-6 word human title>"}

Rules:
- deliverable: ranked_list=ranked table, dashboard=overview charts, scorecard=KPIs, comparison=period vs period, single_answer=one stat card
- subject: entity being ranked; "none" for dashboards/comparisons/scorecards
- metric: revenue=dollar sales, spend=customer spend, units=quantity, count=transaction count, margin_pct=profit margin%, avg_ticket=avg sale value
- direction: top=highest first, bottom=lowest first (worst/slowest/least/stop selling = bottom)
- timeframe_days: 7=week, 30=month, 90=quarter, 365=year; default 30

Examples:
"who are my best customers" -> {"deliverable":"ranked_list","subject":"customers","metric":"spend","direction":"top","timeframe_days":30,"title":"Top Customers by Spend"}
"show me top products" -> {"deliverable":"ranked_list","subject":"products","metric":"revenue","direction":"top","timeframe_days":30,"title":"Best Selling Products"}
"who sold the most" -> {"deliverable":"ranked_list","subject":"staff","metric":"revenue","direction":"top","timeframe_days":30,"title":"Top Staff by Sales"}
"what are my busiest days" -> {"deliverable":"ranked_list","subject":"days","metric":"revenue","direction":"top","timeframe_days":30,"title":"Busiest Days of Week"}
"what hours are busiest" -> {"deliverable":"ranked_list","subject":"hours","metric":"count","direction":"top","timeframe_days":30,"title":"Busiest Hours of Day"}
"rank categories by revenue" -> {"deliverable":"ranked_list","subject":"categories","metric":"revenue","direction":"top","timeframe_days":30,"title":"Top Categories by Revenue"}
"which products should I stop selling" -> {"deliverable":"ranked_list","subject":"products","metric":"units","direction":"bottom","timeframe_days":30,"title":"Worst Selling Products"}
"show me a dashboard" -> {"deliverable":"dashboard","subject":"none","metric":"none","direction":"top","timeframe_days":7,"title":"Business Overview Dashboard"}
"how am I doing" -> {"deliverable":"scorecard","subject":"none","metric":"none","direction":"top","timeframe_days":7,"title":"Business Performance Scorecard"}
"what is my average ticket" -> {"deliverable":"single_answer","subject":"revenue","metric":"avg_ticket","direction":"top","timeframe_days":7,"title":"Average Transaction Value"}`

const BENCHMARK = [
  { q: 'who are my best customers',              expect: { deliverable: 'ranked_list', subject: 'customers' } },
  { q: 'show me top selling products this month', expect: { deliverable: 'ranked_list', subject: 'products' } },
  { q: 'which staff member sold the most',        expect: { deliverable: 'ranked_list', subject: 'staff' } },
  { q: 'what is my busiest day of the week',      expect: { deliverable: 'ranked_list', subject: 'days' } },
  { q: 'what time of day is busiest',             expect: { deliverable: 'ranked_list', subject: 'hours' } },
  { q: 'rank all my product categories',          expect: { deliverable: 'ranked_list', subject: 'categories' } },
  { q: 'which products should I stop selling',    expect: { deliverable: 'ranked_list', subject: 'products', direction: 'bottom' } },
  { q: 'give me a business dashboard',            expect: { deliverable: 'dashboard' } },
  { q: 'how is my business performing',           expect: { deliverable: 'scorecard' } },
  { q: "what's my average ticket size",           expect: { deliverable: 'single_answer', metric: 'avg_ticket' } },
]

async function classify(message) {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system: INTENT_SYSTEM,
    messages: [{ role: 'user', content: message }],
  })
  const raw = res.content[0]?.type === 'text' ? res.content[0].text.trim() : ''
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : null
  } catch { return null }
}

let pass = 0
for (const { q, expect } of BENCHMARK) {
  const result = await classify(q)
  const checks = [
    !expect.deliverable || result?.deliverable === expect.deliverable,
    !expect.subject     || result?.subject === expect.subject,
    !expect.direction   || result?.direction === expect.direction,
    !expect.metric      || result?.metric === expect.metric,
  ]
  const ok = result && checks.every(Boolean)
  if (ok) pass++
  const mark = ok ? '✓' : '✗'
  console.log(mark + ' [' + (result?.deliverable ?? '?') + '/' + (result?.subject ?? '?') + '] ' + q)
  if (!ok) console.log('  Expected:', JSON.stringify(expect), '\n  Got:', JSON.stringify(result))
}
console.log('\nScore: ' + pass + '/10' + (pass >= 8 ? '  PASS' : '  FAIL'))
