/**
 * generate-dalle-cafe-images.ts
 *
 * Generates professional product photos for all 58 cafe menu items using
 * DALL-E 3, then uploads them to Supabase Storage at pos-images/cafe-dalle/.
 *
 * Cost:  58 images × $0.04 (standard 1024×1024) ≈ $2.32
 * Time:  ~9 min  (9 s delay between calls — conservative rate-limit guard)
 * Idempotent: skips any key that already exists in the bucket.
 *
 * Usage:
 *   npx vercel env pull .env.local
 *   npm run seed:dalle-images
 */

import { createClient }  from '@supabase/supabase-js'
import OpenAI            from 'openai'
import * as path         from 'path'
import * as dotenv       from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENAI_KEY    = process.env.OPENAI_API_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE env vars. Run: npx vercel env pull .env.local')
  process.exit(1)
}
if (!OPENAI_KEY) {
  console.error('Missing OPENAI_API_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const openai   = new OpenAI({ apiKey: OPENAI_KEY })

const BUCKET    = 'pos-images'
const FOLDER    = 'cafe-dalle'
const BASE_URL  = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${FOLDER}`

const STYLE_SUFFIX = ', isolated on pure white background, soft drop shadow underneath, photorealistic professional product photography, top down angle slightly tilted, no text no logos no garnish, centered composition, square crop'

const IMAGE_PROMPTS: Record<string, string> = {
  'espresso':         'Single espresso shot in a small white ceramic cup with a golden crema layer' + STYLE_SUFFIX,
  'flat-white':       'Flat white coffee in a white ceramic cup with smooth microfoam latte art' + STYLE_SUFFIX,
  'latte':            'Cafe latte in a tall white ceramic cup with layered espresso and steamed milk with latte art' + STYLE_SUFFIX,
  'cappuccino':       'Cappuccino in a white ceramic cup with thick dry foam and light dusting of cocoa powder' + STYLE_SUFFIX,
  'long-black':       'Long black coffee in a white ceramic cup, dark espresso over hot water with golden crema' + STYLE_SUFFIX,
  'macchiato':        'Espresso macchiato in a small glass with a precise dollop of steamed milk foam on top' + STYLE_SUFFIX,
  'mocha':            'Mocha coffee in a white ceramic cup with chocolate sauce drizzle and velvety steamed milk' + STYLE_SUFFIX,
  'piccolo':          'Piccolo latte in a small 100ml glass with ristretto espresso and velvety steamed milk' + STYLE_SUFFIX,
  'cortado':          'Cortado coffee in a small clear glass with equal parts espresso and warm steamed milk' + STYLE_SUFFIX,
  'cold-brew':        'Cold brew coffee in a clear tall glass filled with ice cubes and very dark smooth coffee' + STYLE_SUFFIX,
  'iced-latte':       'Iced latte in a clear tall glass with visible ice cubes, espresso, and cold milk layers' + STYLE_SUFFIX,
  'iced-mocha':       'Iced mocha in a clear glass with ice, espresso, chocolate syrup ribbons, and cold milk' + STYLE_SUFFIX,
  'iced-chocolate':   'Iced chocolate milk drink in a clear glass with ice cubes and chocolate sauce drizzle' + STYLE_SUFFIX,
  'affogato':         'Affogato dessert with a scoop of vanilla ice cream with hot espresso poured over it melting' + STYLE_SUFFIX,
  'frappe':           'Blended coffee frappé in a clear glass with whipped cream on top and coffee visible through ice' + STYLE_SUFFIX,
  'tea':              'English breakfast tea in a white ceramic cup with a tea bag on the side, amber liquid' + STYLE_SUFFIX,
  'chai-latte':       'Spiced chai latte in a white ceramic mug with cinnamon dusted on top of frothy milk' + STYLE_SUFFIX,
  'matcha-latte':     'Matcha green tea latte in a white ceramic cup with vibrant jade green color and smooth foam' + STYLE_SUFFIX,
  'turmeric-latte':   'Turmeric golden latte in a white ceramic cup with rich golden-yellow color and warm spice dusting' + STYLE_SUFFIX,
  'dirty-chai':       'Dirty chai latte in a glass with dark espresso shot floating on spiced chai milk' + STYLE_SUFFIX,
  'hot-chocolate':    'Rich hot chocolate in a white ceramic mug with whipped cream and chocolate shavings on top' + STYLE_SUFFIX,
  'orange-juice':     'Freshly squeezed orange juice in a clear glass with bright citrus orange color and tiny pulp' + STYLE_SUFFIX,
  'apple-juice':      'Fresh pressed apple juice in a clear glass with golden yellow color and natural clarity' + STYLE_SUFFIX,
  'sparkling-water':  'Sparkling mineral water in a clear glass with ice cubes and fine champagne bubbles rising' + STYLE_SUFFIX,
  'water-bottle':     'Sealed glass water bottle with label removed showing clean still mineral water' + STYLE_SUFFIX,
  'banana-smoothie':  'Banana smoothie in a clear glass with thick creamy yellow texture, fresh and wholesome' + STYLE_SUFFIX,
  'berry-smoothie':   'Mixed berry smoothie in a clear glass with vibrant deep purple-red color and smooth texture' + STYLE_SUFFIX,
  'mango-smoothie':   'Mango smoothie in a clear glass with thick bright orange-yellow tropical blend, luscious' + STYLE_SUFFIX,
  'green-smoothie':   'Green smoothie in a clear glass with spinach kale apple and banana blend, vibrant green' + STYLE_SUFFIX,
  'milkshake':        'Classic vanilla milkshake in a tall clear glass with whipped cream swirl and sprinkles on top' + STYLE_SUFFIX,
  'soft-drink':       'Cola soft drink in a clear glass with ice cubes and fizzy carbonation bubbles' + STYLE_SUFFIX,
  'avocado-toast':    'Avocado toast on thick-cut sourdough bread with sliced avocado fanned out and sesame seeds' + STYLE_SUFFIX,
  'eggs-benedict':    'Eggs Benedict with two perfectly poached eggs and hollandaise sauce on toasted English muffin' + STYLE_SUFFIX,
  'scrambled-eggs':   'Creamy soft scrambled eggs mounded on a white plate with fresh chives and cracked black pepper' + STYLE_SUFFIX,
  'poached-eggs':     'Two perfectly poached eggs on sourdough toast with golden runny yolk just breaking' + STYLE_SUFFIX,
  'big-breakfast':    'Full cafe breakfast plate with fried eggs bacon sausages grilled tomato mushrooms and sourdough toast' + STYLE_SUFFIX,
  'bacon-egg-roll':   'Bacon and egg roll in a soft white bread roll with crispy bacon and runny egg yolk' + STYLE_SUFFIX,
  'granola-bowl':     'Granola breakfast bowl with thick Greek yogurt fresh blueberries honey drizzle and almonds' + STYLE_SUFFIX,
  'acai-bowl':        'Acai smoothie bowl with thick vibrant purple base topped with banana slices fresh berries and granola' + STYLE_SUFFIX,
  'banana-bread':     'Thick slice of moist banana bread with golden brown crust on a white ceramic plate' + STYLE_SUFFIX,
  'bircher-muesli':   'Bircher muesli in a white bowl with overnight oats apple grated yogurt and toasted seeds' + STYLE_SUFFIX,
  'toasted-sandwich': 'Toasted sourdough sandwich with melted cheese filling pressed and golden brown with crosshatch marks' + STYLE_SUFFIX,
  'beef-burger':      'Gourmet beef burger in a brioche bun with lettuce tomato melted cheese on a small wooden board' + STYLE_SUFFIX,
  'chicken-wrap':     'Grilled chicken wrap cut in half showing filling of tender chicken fresh salad and sauce' + STYLE_SUFFIX,
  'falafel-wrap':     'Falafel wrap cut in half showing crispy golden falafel balls fresh salad and tahini sauce' + STYLE_SUFFIX,
  'caesar-salad':     'Caesar salad in a white bowl with crisp romaine lettuce golden croutons and parmesan shavings' + STYLE_SUFFIX,
  'greek-salad':      'Greek salad in a white bowl with ripe tomatoes cucumber kalamata olives and crumbled feta' + STYLE_SUFFIX,
  'soup':             'Cream of tomato soup in a white ceramic bowl with a swirl of cream and fresh basil leaf' + STYLE_SUFFIX,
  'quiche':           'Slice of quiche lorraine with golden egg and cheese custard filling in a buttery pastry crust' + STYLE_SUFFIX,
  'sausage-roll':     'Flaky golden puff pastry sausage roll with visible layers on a white ceramic plate' + STYLE_SUFFIX,
  'meat-pie':         'Individual Australian meat pie with deep golden pastry crust and flaky pastry lid' + STYLE_SUFFIX,
  'croissant':        'Perfectly baked buttery croissant with golden flaky laminated layers on a white ceramic plate' + STYLE_SUFFIX,
  'pain-au-chocolat': 'Pain au chocolat pastry with golden flaky layers and dark chocolate visible at the ends' + STYLE_SUFFIX,
  'muffin':           'Blueberry muffin with a tall domed golden top overflowing with blueberries in a paper case' + STYLE_SUFFIX,
  'cookie':           'Large bakery-style chocolate chip cookie with gooey melted chips on a white ceramic plate' + STYLE_SUFFIX,
  'brownie':          'Dense fudgy chocolate brownie square with shiny crackled top dusted with icing sugar' + STYLE_SUFFIX,
  'cake-slice':       'Slice of layered vanilla sponge cake with thick cream frosting and fresh strawberry on top' + STYLE_SUFFIX,
  'scone':            'Freshly baked plain scone with golden top split open showing fluffy inside with jam and clotted cream' + STYLE_SUFFIX,
}

// ── helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}


async function uploadBuffer(key: string, buffer: Buffer): Promise<void> {
  const storagePath = `${FOLDER}/${key}.png`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/png', upsert: true })
  if (error && !error.message.includes('already exists')) throw error
}

async function existsInBucket(key: string): Promise<boolean> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .list(FOLDER, { search: `${key}.png` })
  return (data ?? []).some(f => f.name === `${key}.png`)
}

async function ensureBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!(buckets ?? []).find(b => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024 })
    console.log(`  ✓ Created bucket "${BUCKET}"`)
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await ensureBucket()

  const keys    = Object.keys(IMAGE_PROMPTS)
  const total   = keys.length
  let generated = 0
  let skipped   = 0
  let failed    = 0
  const urls: Record<string, string> = {}

  console.log(`\n🎨 gpt-image-1 Cafe Image Generator`)
  console.log(`   ${total} images · ~$${(total * 0.04).toFixed(2)} · ~${Math.ceil(total * 9 / 60)} min\n`)

  for (let i = 0; i < keys.length; i++) {
    const key    = keys[i]
    const prompt = IMAGE_PROMPTS[key]

    // Skip if already in bucket
    if (await existsInBucket(key)) {
      const publicUrl = `${BASE_URL}/${key}.png`
      urls[key] = publicUrl
      skipped++
      console.log(`  ⏭  [${i + 1}/${total}] ${key} — skipped (already exists)`)
      continue
    }

    // Rate-limit guard: 9 s between generations
    if (generated > 0) {
      process.stdout.write(`  ⏳ waiting 9 s...`)
      await delay(9000)
      process.stdout.write(` done\n`)
    }

    process.stdout.write(`  🖼  [${i + 1}/${total}] ${key}...`)

    try {
      // Generate via gpt-image-1 — always returns b64_json, no response_format param
      const response = await openai.images.generate({
        model:   'gpt-image-1',
        prompt,
        size:    '1024x1024',
        quality: 'medium' as 'medium',
        n:       1,
      } as Parameters<typeof openai.images.generate>[0])

      const b64 = (response.data ?? [])[0]?.b64_json
      if (!b64) throw new Error('No b64_json returned by gpt-image-1')
      await uploadBuffer(key, Buffer.from(b64, 'base64'))

      const publicUrl = `${BASE_URL}/${key}.png`
      urls[key] = publicUrl
      generated++
      console.log(` ✓ uploaded`)
    } catch (err: unknown) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.log(` ✗ FAILED — ${msg}`)
    }
  }

  // ── Results ──────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60))
  console.log(`✅  Generated : ${generated}`)
  console.log(`⏭   Skipped   : ${skipped}`)
  console.log(`❌  Failed    : ${failed}`)
  console.log(`💵  Est. cost : $${(generated * 0.04).toFixed(2)}`)
  console.log('─'.repeat(60))

  if (Object.keys(urls).length === 0) {
    console.log('\nNo URLs to output.')
    return
  }

  // ── PRODUCT_IMAGES output — paste into cafe-seed-products.ts ────────────
  console.log('\n// ── PASTE into src/lib/pos/cafe-seed-products.ts ──────────────\n')
  console.log('const PRODUCT_IMAGES: Record<string, string> = {')
  for (const [key, url] of Object.entries(urls)) {
    console.log(`  '${key}': '${url}',`)
  }
  console.log('}')
  console.log('\n// ── END PASTE ───────────────────────────────────────────────\n')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})