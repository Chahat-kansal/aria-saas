import { createClient } from '@supabase/supabase-js'
import { getRelevantImage } from '@/lib/images/pixabay'
import { removeBackgroundAIEngine } from './remove-background'

const BUCKET = 'pos-images'

export type ImageCreditStatus = {
  free_remaining: number
  paid_credits: number
}

export async function getImageCreditStatus(businessId: string): Promise<ImageCreditStatus> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  let { data } = await supabase
    .from('pos_image_credits')
    .select('free_used, free_limit, paid_credits')
    .eq('business_id', businessId)
    .maybeSingle()

  if (!data) {
    await supabase.from('pos_image_credits').insert({ business_id: businessId })
    return { free_remaining: 5, paid_credits: 0 }
  }
  return {
    free_remaining: Math.max(0, data.free_limit - data.free_used),
    paid_credits: data.paid_credits,
  }
}

/**
 * Build a Pixabay/Unsplash search query using all available context.
 * Category name + description words significantly reduce mismatch (e.g. "Acai Smoothie" +
 * category "Smoothies & Bowls" → much better image match than name alone).
 */
function buildProductSearchQuery(
  productName: string,
  industry: string | null | undefined,
  categoryName?: string | null,
  descriptionHint?: string | null,
): string {
  const name = productName.toLowerCase().trim()

  // If we have a category name, use it as primary context
  if (categoryName) {
    const cat = categoryName.toLowerCase()
    const key = name.split(' ').slice(0, 3).join(' ')
    // For food/beverage categories, combine product name + category for specificity
    if (cat.includes('coffee') || cat.includes('espresso')) return key + ' coffee drink cafe'
    if (cat.includes('smoothie') || cat.includes('juice') || cat.includes('bowl')) return key + ' ' + cat + ' fresh drink'
    if (cat.includes('beer') || cat.includes('lager') || cat.includes('ale')) return key + ' beer bottle can cold'
    if (cat.includes('wine')) return key + ' wine bottle glass'
    if (cat.includes('spirit') || cat.includes('whisky') || cat.includes('gin') || cat.includes('vodka')) return key + ' spirits bottle bar'
    if (cat.includes('food') || cat.includes('meal') || cat.includes('dish')) return key + ' ' + cat + ' fresh food'
    if (cat.includes('snack') || cat.includes('chip')) return key + ' snack food retail'
    // Generic: product + category
    return (key + ' ' + cat).slice(0, 80)
  }

  // Description-word extraction (take first 3 meaningful words)
  const descWords = descriptionHint
    ? descriptionHint.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(' ')
    : ''

  const beerWords    = ['vb', 'victoria bitter', 'carlton', 'tooheys', 'xxxx', 'great northern', 'corona', 'heineken', 'beer', 'lager', 'ale', 'stout', 'ipa', 'pale ale']
  const wineWords    = ['wine', 'shiraz', 'chardonnay', 'merlot', 'sauvignon', 'pinot', 'cab sav', 'riesling', 'prosecco', 'sparkling', 'rose', 'rosé']
  const spiritWords  = ['whisky', 'whiskey', 'bourbon', 'vodka', 'gin', 'rum', 'tequila', 'brandy', 'scotch', 'jack daniel', 'johnnie walker', 'baileys', 'kahlua', 'absolut', 'grey goose']
  const ciderWords   = ['cider', 'hard cider']
  const softDrWords  = ['coca cola', 'coke', 'pepsi', 'sprite', 'fanta', 'solo', 'mountain dew', 'red bull', 'monster', 'v energy', 'soda', 'lemonade', 'juice', 'water', 'sparkling water']
  const snackWords   = ['nobby', 'chips', 'crisps', 'nuts', 'peanuts', 'popcorn', 'jerky', 'biscuit', 'cookie', 'chocolate', 'candy', 'lolly', 'tim tam', 'smiths', 'doritos']
  const coffeeWords  = ['coffee', 'espresso', 'latte', 'cappuccino', 'flat white', 'long black', 'mocha', 'cold brew', 'ristretto', 'macchiato', 'chai', 'matcha']
  const smoothieWords = ['smoothie', 'acai', 'bowl', 'blend', 'shake', 'juice', 'fresh press']
  const foodWords    = ['sandwich', 'burger', 'wrap', 'salad', 'cake', 'pastry', 'croissant', 'muffin', 'bagel', 'toast', 'eggs', 'bacon', 'avocado', 'sushi', 'pizza', 'pasta']

  if (beerWords.some(k => name.includes(k)))      return 'beer cans bottles cold drinks bar'
  if (wineWords.some(k => name.includes(k)))      return 'wine bottle glass vineyard'
  if (spiritWords.some(k => name.includes(k)))    return 'spirits whisky bottle bar glass'
  if (ciderWords.some(k => name.includes(k)))     return 'cider apple bottle drink'
  if (softDrWords.some(k => name.includes(k)))    return 'soft drink can bottle cold beverage'
  if (snackWords.some(k => name.includes(k)))     return 'snacks chips packet food retail'
  if (coffeeWords.some(k => name.includes(k)))    return (name + ' coffee drink cafe').slice(0, 80)
  if (smoothieWords.some(k => name.includes(k)))  return (name + ' fresh healthy drink' + (descWords ? ' ' + descWords : '')).slice(0, 80)
  if (foodWords.some(k => name.includes(k)))      return (name + ' food fresh plate' + (descWords ? ' ' + descWords : '')).slice(0, 80)

  if (industry === 'liquor')     return 'alcoholic drink bottle retail bar'
  if (industry === 'cafe')       return (name + ' cafe drink food' + (descWords ? ' ' + descWords : '')).slice(0, 80)
  if (industry === 'bakery')     return (name + ' bakery fresh baked').slice(0, 80)
  if (industry === 'restaurant') return (name + ' restaurant food plate').slice(0, 80)

  // Fallback: name + description words for best specificity
  return (name + (descWords ? ' ' + descWords : '') + ' retail product').slice(0, 80)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function normalizeAndUpload(
  supabase: ReturnType<typeof createClient<any, any, any>>,
  buffer: Buffer,
  storagePath: string,
  contentType: string,
): Promise<{ image_url: string; image_thumb_url: string | null }> {
  try {
    const sharp = (await import('sharp')).default

    let quality = 85
    let mainBuf = await sharp(buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
    while (mainBuf.byteLength > 153600 && quality > 30) {
      quality -= 10
      mainBuf = await sharp(buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer()
    }
    const thumbBuf = await sharp(buffer)
      .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer()

    const mainPath = storagePath.replace(/\.(jpe?g|png|webp)$/i, '.webp')
    const thumbPath = mainPath.replace('.webp', '-thumb.webp')

    const [mainRes, thumbRes] = await Promise.all([
      supabase.storage.from(BUCKET).upload(mainPath, mainBuf, { contentType: 'image/webp', upsert: true }),
      supabase.storage.from(BUCKET).upload(thumbPath, thumbBuf, { contentType: 'image/webp', upsert: true }),
    ])

    if (mainRes.error) {
      // Fall back to original upload without normalize
      const { error: fallbackErr } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType, upsert: true })
      if (fallbackErr) throw new Error(fallbackErr.message)
      return {
        image_url: supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl,
        image_thumb_url: null,
      }
    }

    return {
      image_url: supabase.storage.from(BUCKET).getPublicUrl(mainPath).data.publicUrl,
      image_thumb_url: thumbRes.error ? null : supabase.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl,
    }
  } catch {
    // Sharp unavailable or failed — fall back to raw upload
    const { error: fallbackErr } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType, upsert: true })
    if (fallbackErr) throw new Error(fallbackErr.message)
    return {
      image_url: supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl,
      image_thumb_url: null,
    }
  }
}

/**
 * Fire-and-forget image fetcher for products without an image.
 *
 * Free path (free_remaining > 0): Pixabay/Unsplash scene photo + Sharp normalize.
 * Paid path (usePaidCredit: true): Pixabay source + PhotoRoom bg removal → transparent PNG + Sharp normalize.
 * No credits at all: stops silently (UI modal handles the choice).
 */
export function autoFetchProductImage(opts: {
  productId: string
  productName: string
  industry?: string | null
  businessId: string
  usePaidCredit?: boolean
  categoryId?: string | null
  descriptionHint?: string | null
}): void {
  const { productId, productName, industry, businessId, usePaidCredit = false, categoryId, descriptionHint } = opts

  const category: 'food' | 'all' =
    industry === 'cafe' || industry === 'restaurant' || industry === 'bakery' ? 'food' : 'all'

  ;(async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
      const credits = await getImageCreditStatus(businessId)

      if (credits.free_remaining === 0 && !usePaidCredit) {
        console.log('[auto-fetch-image] no free credits for "' + productName + '" — modal will handle')
        return
      }
      if (usePaidCredit && credits.paid_credits === 0) {
        console.warn('[auto-fetch-image] no paid credits for "' + productName + '"')
        return
      }

      // Fetch category name for better search query
      let categoryName: string | null = null
      if (categoryId) {
        const { data: cat } = await supabase.from('pos_categories').select('name').eq('id', categoryId).maybeSingle()
        categoryName = (cat?.name as string | null) ?? null
      }

      const searchQuery = buildProductSearchQuery(productName, industry, categoryName, descriptionHint)

      const sourceUrl = await getRelevantImage(searchQuery, { category, orientation: 'all', preferIsolated: usePaidCredit })
      if (!sourceUrl) {
        console.warn('[auto-fetch-image] no source image for "' + productName + '"')
        return
      }

      const safeName = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
      let finalBuffer: Buffer
      let storagePath: string
      let bgRemoved = false
      let contentType = 'image/jpeg'

      if (usePaidCredit) {
        finalBuffer = await removeBackgroundAIEngine(sourceUrl)
        storagePath = 'owner-products/' + productId + '-' + safeName + '-transparent.webp'
        contentType = 'image/png'
        bgRemoved = true
        await supabase.rpc('decrement_paid_credit', { bid: businessId })
      } else {
        const res = await fetch(sourceUrl)
        finalBuffer = Buffer.from(await res.arrayBuffer())
        storagePath = 'owner-products/' + productId + '-' + safeName + '.webp'
        await supabase.rpc('increment_free_used', { bid: businessId })
      }

      const { image_url, image_thumb_url } = await normalizeAndUpload(supabase, finalBuffer, storagePath, contentType)

      await supabase
        .from('pos_products')
        .update({
          image_url,
          image_thumb_url,
          image_source: bgRemoved ? 'photoroom' : 'auto',
        })
        .eq('id', productId)

      await supabase.from('pos_image_transactions').insert({
        business_id: businessId,
        product_id: productId,
        type: usePaidCredit ? 'paid_single' : 'free',
        bg_removed: bgRemoved,
        amount_charged: usePaidCredit ? 0.29 : 0,
      })

      console.log('[auto-fetch-image] ✓ "' + productName + '" (bgRemoved: ' + bgRemoved + ', thumb: ' + !!image_thumb_url + ')')
    } catch (err: unknown) {
      console.error('[auto-fetch-image] error for "' + productName + '":', err instanceof Error ? err.message : err)
    }
  })()
}
