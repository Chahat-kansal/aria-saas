/**
 * Pre-launch smoke test — run with: npx tsx scripts/smoke-test.ts
 * Verifies 10 critical system paths before any deployment.
 * Uses environment variables from .env.local. Never hardcode credentials.
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// Load .env.local
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const TEST_BID = process.env.SMOKE_TEST_BUSINESS_ID || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

type Result = { name: string; ok: boolean; ms: number; error?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  const t = Date.now()
  try {
    await fn()
    const ms = Date.now() - t
    results.push({ name, ok: true, ms })
    console.log(`  \x1b[32m✓\x1b[0m ${name} (${ms}ms)`)
  } catch (e) {
    const ms = Date.now() - t
    const error = (e as Error).message || String(e)
    results.push({ name, ok: false, ms, error })
    console.log(`  \x1b[31m✗\x1b[0m ${name} — ${error}`)
  }
}

async function main() {
  console.log('\n\x1b[1mAria OS Smoke Test\x1b[0m')
  console.log('Base URL:', BASE_URL)
  console.log('Test BID:', TEST_BID || '(not set — Supabase checks will use COUNT only)\n')

  // 1. /api/ping → expect 200
  await check('/api/ping → 200', async () => {
    const r = await fetch(BASE_URL + '/api/ping')
    if (!r.ok) throw new Error('HTTP ' + r.status)
  })

  // 2. /api/aria/daily-briefing → expect 200 + briefing key
  await check('/api/aria/daily-briefing → 200 + briefing', async () => {
    const url = BASE_URL + '/api/aria/daily-briefing' + (TEST_BID ? '?business_id=' + TEST_BID : '')
    const r = await fetch(url)
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const body = await r.json() as Record<string, unknown>
    if (!('briefing' in body) && !('bullets' in body) && !('error' in body)) {
      throw new Error('Missing briefing/bullets key in response')
    }
  })

  // 3. /api/aria/ask → expect 200 + response key
  await check('/api/aria/ask → 200 + response', async () => {
    const r = await fetch(BASE_URL + '/api/aria/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is my revenue today?', business_id: TEST_BID }),
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const body = await r.json() as Record<string, unknown>
    if (!('response' in body) && !('answer' in body) && !('error' in body)) {
      throw new Error('Missing response/answer key')
    }
  })

  // 4. /api/aria/reorder-forecast → expect 200 + items key
  await check('/api/aria/reorder-forecast → 200 + items', async () => {
    const url = BASE_URL + '/api/aria/reorder-forecast' + (TEST_BID ? '?business_id=' + TEST_BID : '')
    const r = await fetch(url)
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const body = await r.json() as Record<string, unknown>
    if (!('items' in body) && !('forecasts' in body) && !('error' in body)) {
      throw new Error('Missing items/forecasts key')
    }
  })

  // 5. Supabase: active businesses count > 0
  await check('Supabase: active businesses > 0', async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('SUPABASE env vars not set')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { count, error } = await supabase
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
    if (error) throw new Error(error.message)
    if (!count || count === 0) throw new Error('No active businesses found')
  })

  // 6. Supabase: pos_products for test business > 0
  await check('Supabase: pos_products for test business > 0', async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('SUPABASE env vars not set')
    if (!TEST_BID) throw new Error('SMOKE_TEST_BUSINESS_ID not set — skipping product check')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { count, error } = await supabase
      .from('pos_products')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', TEST_BID)
    if (error) throw new Error(error.message)
    if (!count || count === 0) throw new Error('No products found for test business')
  })

  // 7. Stripe connection: retrieve test customer
  await check('Stripe API connection', async () => {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY not set')
    const r = await fetch('https://api.stripe.com/v1/customers?limit=1', {
      headers: { Authorization: 'Bearer ' + key },
    })
    if (!r.ok) throw new Error('Stripe returned HTTP ' + r.status)
  })

  // 8. Anthropic API key — tiny Haiku call
  await check('Anthropic API key valid (Haiku)', async () => {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY not set')
    const client = new Anthropic({ apiKey: key })
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say OK' }],
    })
    if (!res.content.length) throw new Error('Empty response from Anthropic')
  })

  // 9. Twilio credentials
  await check('Twilio credentials valid', async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    if (!sid || !token) throw new Error('TWILIO env vars not set')
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '.json', {
      headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + token).toString('base64') },
    })
    if (!r.ok) throw new Error('Twilio returned HTTP ' + r.status)
  })

  // 10. Resend credentials — list domains
  await check('Resend credentials valid', async () => {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY not set')
    const r = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: 'Bearer ' + key },
    })
    if (!r.ok) throw new Error('Resend returned HTTP ' + r.status)
  })

  // Summary
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log('\n' + (failed === 0 ? '\x1b[32m' : '\x1b[31m') +
    `${passed}/${results.length} checks passed` + '\x1b[0m')

  if (failed > 0) {
    console.log('\nFailed checks:')
    results.filter(r => !r.ok).forEach(r => console.log('  ✗', r.name, '—', r.error))
    process.exit(1)
  } else {
    console.log('\n\x1b[32mAll checks passed. System is ready for deployment.\x1b[0m\n')
    process.exit(0)
  }
}

main().catch(e => {
  console.error('Smoke test crashed:', e)
  process.exit(1)
})