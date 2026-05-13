// One-time script: fetch real food photos from Unsplash for each cafe product
// and update image_url directly in Supabase.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nxfzippunqvqsvkmwtjv.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54ZnppcHB1bnF2cXN2a213dGp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc2NjA4MywiZXhwIjoyMDkyMzQyMDgzfQ.eKtaDmRCeqkSj2GWv863stK_KRHCu4Qel55yWQtIg2Q'
const UNSPLASH_KEY = '7Iie40ZZojAQjysmowvo_tUuoOVph1SZsgLdeXzX9Ms'
const BUSINESS_ID  = 'ff5055a0-c351-4ada-817a-1804961035f3'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function fetchFoodPhoto(query) {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=squarish&content_filter=high`
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } })
  if (!res.ok) { console.warn(`Unsplash error for "${query}": ${res.status}`); return null }
  const d = await res.json()
  const photo = d.results?.[0]
  return photo?.urls?.small ?? photo?.urls?.regular ?? null
}

// More specific search queries for better Unsplash results
const PRODUCT_QUERIES = {
  'Espresso':              'espresso coffee shot',
  'Short Black':           'espresso coffee',
  'Long Black':            'black coffee americano',
  'Macchiato':             'macchiato espresso',
  'Long Macchiato':        'macchiato coffee',
  'Flat White':            'flat white latte art',
  'Latte':                 'latte coffee art',
  'Cappuccino':            'cappuccino froth',
  'Mocha':                 'mocha coffee chocolate',
  'Piccolo':               'piccolo latte coffee',
  'Cortado':               'cortado coffee',
  'Hot Chocolate':         'hot chocolate drink mug',
  'Chai Latte':            'chai latte spice',
  'Matcha Latte':          'matcha green latte',
  'Turmeric Latte':        'golden turmeric milk',
  'Dirty Chai':            'chai coffee spice',
  'Iced Latte':            'iced latte coffee glass',
  'Iced Long Black':       'iced black coffee',
  'Iced Mocha':            'iced mocha coffee',
  'Iced Chocolate':        'iced chocolate drink',
  'Affogato':              'affogato ice cream espresso',
  'Cold Brew':             'cold brew coffee',
  'Frappé':                'frappe blended coffee',
  'English Breakfast':     'english breakfast tea',
  'Earl Grey':             'earl grey tea cup',
  'Green Sencha':          'green tea cup',
  'Peppermint':            'peppermint herbal tea',
  'Chamomile':             'chamomile tea flowers',
  'Chai Tea':              'chai spice tea',
  'Lemongrass and Ginger': 'ginger lemon herbal tea',
  'Avocado Toast':         'avocado toast sourdough',
  'Eggs Benedict':         'eggs benedict hollandaise',
  'Scrambled Eggs':        'scrambled eggs breakfast',
  'Poached Eggs':          'poached eggs toast',
  'Big Breakfast':         'full breakfast plate eggs',
  'Bacon and Egg Roll':    'bacon egg roll brioche',
  'Granola Bowl':          'granola yogurt berries bowl',
  'Acai Bowl':             'acai bowl granola toppings',
  'Banana Bread':          'banana bread slice loaf',
  'Bircher Muesli':        'bircher muesli oats',
  'Toasted Sandwich':      'toasted sandwich cafe',
  'Beef Burger':           'beef burger gourmet',
  'Chicken Wrap':          'chicken wrap roll',
  'Falafel Wrap':          'falafel wrap pita',
  'Caesar Salad':          'caesar salad croutons',
  'Greek Salad':           'greek salad feta olives',
  'Soup of the Day':       'soup bowl rustic',
  'Quiche':                'quiche slice tart',
  'Sausage Roll':          'sausage roll pastry',
  'Meat Pie':              'meat pie pastry crust',
  'Croissant':             'croissant fresh bakery',
  'Pain au Chocolat':      'pain au chocolat chocolate',
  'Banana Bread Slice':    'banana bread slice',
  'Muffin':                'blueberry muffin bakery',
  'Cookie':                'chocolate chip cookie',
  'Slice':                 'caramel slice cake bakery',
  'Cake Slice':            'cake slice dessert',
  'Brownie':               'chocolate brownie',
  'Scone':                 'scone jam cream',
  'Still Water 600ml':     'water bottle mineral',
  'Sparkling Water 500ml': 'sparkling water bubbles',
  'Orange Juice':          'fresh orange juice glass',
  'Apple Juice':           'apple juice glass',
  'Banana Smoothie':       'banana smoothie drink',
  'Berry Smoothie':        'berry smoothie purple',
  'Mango Smoothie':        'mango smoothie orange',
  'Acai Smoothie':         'acai berry smoothie',
  'Green Smoothie':        'green vegetable smoothie',
  'Chocolate Milkshake':   'chocolate milkshake',
  'Vanilla Milkshake':     'vanilla milkshake cream',
  'Caramel Milkshake':     'caramel milkshake',
  'Soft Drink':            'cola soda drink glass',
}

async function run() {
  const { data: products } = await supabase
    .from('pos_products')
    .select('id, name')
    .eq('business_id', BUSINESS_ID)
    .eq('is_active', true)

  if (!products?.length) { console.log('No products found'); return }
  console.log(`Updating ${products.length} products...`)

  let updated = 0, failed = 0
  for (const product of products) {
    const query = PRODUCT_QUERIES[product.name] ?? `${product.name} food cafe`
    const url = await fetchFoodPhoto(query)
    if (url) {
      await supabase
        .from('pos_products')
        .update({ image_url: url, image_source: 'owner' })
        .eq('id', product.id)
      console.log(`  ✓ ${product.name}`)
      updated++
    } else {
      console.log(`  ✗ ${product.name} (no photo found)`)
      failed++
    }
    // Respect Unsplash rate limit (50 req/hr demo, 5000/hr production)
    await new Promise(r => setTimeout(r, 250))
  }

  console.log(`\nDone: ${updated} updated, ${failed} failed`)
}

run().catch(console.error)