import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PIXABAY_KEY = process.env.PIXABAY_API_KEY!
const BUCKET = 'pos-images'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const SEARCH_QUERIES: Record<string, string> = {
  'espresso':           'espresso+cup+coffee',
  'flat-white':         'flat+white+coffee+cup',
  'latte':              'latte+coffee+art',
  'cappuccino':         'cappuccino+coffee',
  'long-black':         'black+coffee+cup',
  'macchiato':          'macchiato+coffee',
  'mocha':              'mocha+coffee',
  'piccolo':            'espresso+coffee+small',
  'cortado':            'cortado+coffee',
  'cold-brew':          'cold+brew+coffee+glass',
  'iced-latte':         'iced+latte+glass',
  'iced-mocha':         'iced+mocha+coffee',
  'iced-chocolate':     'iced+chocolate+drink',
  'affogato':           'affogato+ice+cream',
  'frappe':             'frappe+coffee+blended',
  'tea':                'tea+cup',
  'chai-latte':         'chai+latte+tea',
  'matcha-latte':       'matcha+latte+green',
  'turmeric-latte':     'turmeric+golden+milk',
  'dirty-chai':         'chai+latte+coffee',
  'hot-chocolate':      'hot+chocolate+mug',
  'orange-juice':       'orange+juice+glass',
  'apple-juice':        'apple+juice+glass',
  'sparkling-water':    'sparkling+water+glass',
  'water-bottle':       'water+bottle',
  'banana-smoothie':    'banana+smoothie',
  'berry-smoothie':     'berry+smoothie',
  'mango-smoothie':     'mango+smoothie',
  'green-smoothie':     'green+smoothie',
  'milkshake':          'milkshake+glass',
  'soft-drink':         'cola+drink+glass',
  'avocado-toast':      'avocado+toast',
  'eggs-benedict':      'eggs+benedict',
  'scrambled-eggs':     'scrambled+eggs+breakfast',
  'poached-eggs':       'poached+eggs',
  'big-breakfast':      'full+breakfast+plate',
  'bacon-egg-roll':     'bacon+egg+roll',
  'granola-bowl':       'granola+yogurt+bowl',
  'acai-bowl':          'acai+bowl',
  'banana-bread':       'banana+bread+slice',
  'bircher-muesli':     'muesli+bowl',
  'toasted-sandwich':   'toasted+sandwich',
  'beef-burger':        'burger+beef+gourmet',
  'chicken-wrap':       'chicken+wrap',
  'falafel-wrap':       'falafel+wrap',
  'caesar-salad':       'caesar+salad',
  'greek-salad':        'greek+salad',
  'soup':               'soup+bowl',
  'quiche':             'quiche+slice',
  'sausage-roll':       'sausage+roll+pastry',
  'meat-pie':           'meat+pie',
  'croissant':          'croissant+pastry',
  'pain-au-chocolat':   'pain+au+chocolat+chocolate',
  'muffin':             'muffin+bakery',
  'cookie':             'chocolate+chip+cookie',
  'brownie':            'chocolate+brownie',
  'cake-slice':         'cake+slice',
  'scone':              'scone+cream',
}

function getImageKey(productName: string): string {
  const name = productName.toLowerCase()
  if (name.includes('flat white')) return 'flat-white'
  if (name.includes('iced latte')) return 'iced-latte'
  if (name.includes('iced mocha')) return 'iced-mocha'
  if (name.includes('iced chocolate')) return 'iced-chocolate'
  if (name.includes('iced long black')) return 'cold-brew'
  if (name.includes('cold brew')) return 'cold-brew'
  if (name.includes('cappuccino')) return 'cappuccino'
  if (name.includes('matcha')) return 'matcha-latte'
  if (name.includes('chai latte')) return 'chai-latte'
  if (name.includes('dirty chai')) return 'dirty-chai'
  if (name.includes('turmeric')) return 'turmeric-latte'
  if (name.includes('frappé') || name.includes('frappe')) return 'frappe'
  if (name.includes('affogato')) return 'affogato'
  if (name.includes('piccolo')) return 'piccolo'
  if (name.includes('cortado')) return 'cortado'
  if (name.includes('macchiato')) return 'macchiato'
  if (name.includes('long black')) return 'long-black'
  if (name.includes('mocha')) return 'mocha'
  if (name.includes('hot chocolate')) return 'hot-chocolate'
  if (name.includes('latte')) return 'latte'
  if (name.includes('espresso') || name.includes('short black')) return 'espresso'
  if (name.includes('english breakfast') || name.includes('earl grey') ||
      name.includes('green sencha') || name.includes('peppermint') ||
      name.includes('chamomile') || name.includes('chai tea') ||
      name.includes('lemongrass')) return 'tea'
  if (name.includes('orange juice')) return 'orange-juice'
  if (name.includes('apple juice')) return 'apple-juice'
  if (name.includes('sparkling water')) return 'sparkling-water'
  if (name.includes('still water')) return 'water-bottle'
  if (name.includes('banana smoothie')) return 'banana-smoothie'
  if (name.includes('berry smoothie')) return 'berry-smoothie'
  if (name.includes('mango smoothie')) return 'mango-smoothie'
  if (name.includes('green smoothie')) return 'green-smoothie'
  if (name.includes('acai smoothie')) return 'berry-smoothie'
  if (name.includes('milkshake')) return 'milkshake'
  if (name.includes('soft drink')) return 'soft-drink'
  if (name.includes('avocado toast')) return 'avocado-toast'
  if (name.includes('eggs benedict')) return 'eggs-benedict'
  if (name.includes('scrambled eggs')) return 'scrambled-eggs'
  if (name.includes('poached eggs')) return 'poached-eggs'
  if (name.includes('big breakfast')) return 'big-breakfast'
  if (name.includes('bacon and egg roll')) return 'bacon-egg-roll'
  if (name.includes('granola bowl')) return 'granola-bowl'
  if (name.includes('acai bowl')) return 'acai-bowl'
  if (name.includes('banana bread')) return 'banana-bread'
  if (name.includes('bircher muesli')) return 'bircher-muesli'
  if (name.includes('toasted sandwich')) return 'toasted-sandwich'
  if (name.includes('beef burger')) return 'beef-burger'
  if (name.includes('chicken wrap')) return 'chicken-wrap'
  if (name.includes('falafel wrap')) return 'falafel-wrap'
  if (name.includes('caesar salad')) return 'caesar-salad'
  if (name.includes('greek salad')) return 'greek-salad'
  if (name.includes('soup')) return 'soup'
  if (name.includes('quiche')) return 'quiche'
  if (name.includes('sausage roll')) return 'sausage-roll'
  if (name.includes('meat pie')) return 'meat-pie'
  if (name.includes('pain au chocolat')) return 'pain-au-chocolat'
  if (name.includes('croissant')) return 'croissant'
  if (name.includes('muffin')) return 'muffin'
  if (name.includes('cookie')) return 'cookie'
  if (name.includes('brownie')) return 'brownie'
  if (name.includes('cake slice') || name.includes('slice')) return 'cake-slice'
  if (name.includes('scone')) return 'scone'
  return 'espresso'
}

interface PixabayHit { webformatURL: string; tags: string }

async function searchPixabay(query: string): Promise<string | null> {
  const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${query}&image_type=photo&orientation=horizontal&category=food&safesearch=true&per_page=5&min_width=400`
  return new Promise((resolve) => {
    https.get(url, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.hits?.length > 0) resolve(json.hits[0].webformatURL)
          else resolve(null)
        } catch { resolve(null) }
      })
    }).on('error', () => resolve(null))
  })
}

function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadToBuffer(response.headers.location!).then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      response.on('data', c => chunks.push(c as Buffer))
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    }).on('error', reject)
  })
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.find(b => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 5242880 })
    if (error) console.error('Bucket create error:', error.message)
    else console.log(`Created bucket: ${BUCKET}`)
  }
}

async function main() {
  console.log('🚀 Fetching cafe images from Pixabay...\n')
  if (!PIXABAY_KEY) { console.error('❌ PIXABAY_API_KEY not set'); process.exit(1) }

  await ensureBucket()

  const results: Record<string, string> = {}
  const queries = Object.entries(SEARCH_QUERIES)
  let success = 0; let failed = 0

  for (let i = 0; i < queries.length; i++) {
    const [key, query] = queries[i]
    process.stdout.write(`[${String(i + 1).padStart(2)}/${queries.length}] ${key.padEnd(22)} `)
    try {
      const imageUrl = await searchPixabay(query)
      if (!imageUrl) { console.log('❌ no results'); failed++; continue }
      const buf = await downloadToBuffer(imageUrl)
      const storagePath = `cafe/${key}.jpg`
      const { error } = await supabase.storage.from(BUCKET)
        .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: true })
      if (error) { console.log(`❌ upload: ${error.message}`); failed++; continue }
      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
      results[key] = publicUrl
      success++
      console.log('✓')
    } catch (err: any) {
      console.log(`❌ ${err.message}`)
      failed++
    }
    await new Promise(r => setTimeout(r, 350))
  }

  console.log(`\n✅ Done: ${success} success, ${failed} failed\n`)
  console.log('=== PASTE INTO src/lib/pos/cafe-image-map.ts ===\n')
  console.log(`export const CAFE_IMAGE_MAP: Record<string, string> = ${JSON.stringify(results, null, 2)}\n`)

  // Also update Supabase DB directly for existing Sip products
  console.log('📝 Updating Sip business products in DB...')
  const SIPS_BID = 'ff5055a0-c351-4ada-817a-1804961035f3'
  const { data: products } = await supabase.from('pos_products').select('id, name').eq('business_id', SIPS_BID)
  let dbUpdated = 0
  for (const p of products ?? []) {
    const key = getImageKey(p.name)
    const url = results[key]
    if (url) {
      await supabase.from('pos_products').update({ image_url: url, image_source: 'owner' }).eq('id', p.id)
      dbUpdated++
    }
  }
  console.log(`✅ Updated ${dbUpdated} Sip products in DB\n`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })