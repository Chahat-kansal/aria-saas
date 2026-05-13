import { createClient } from '@supabase/supabase-js'
import { getRelevantImage } from '@/lib/images/pixabay'

/**
 * Fire-and-forget image fetcher for products without an image.
 * Tries Pixabay first, falls back to Unsplash.
 * Updates the product's image_url in the background — does NOT block the response.
 *
 * @example
 *   autoFetchProductImage({ productId, productName: 'Chocolate Smoothie', industry: 'cafe' })
 */
export function autoFetchProductImage(opts: {
  productId: string
  productName: string
  industry?: string | null
}): void {
  const { productId, productName, industry } = opts

  const category: 'food' | 'business' | 'all' =
    industry === 'cafe' || industry === 'restaurant' || industry === 'bakery'
      ? 'food'
      : industry === 'realestate' || industry === 'gym'
      ? 'business'
      : 'all'

  const searchQuery =
    category === 'food'
      ? productName.toLowerCase()
      : `${productName} product`

  getRelevantImage(searchQuery, {
    category,
    orientation: 'all',
    preferIsolated: true,
  })
    .then(async imageUrl => {
      if (!imageUrl) {
        console.warn(`[auto-fetch-image] no image found for "${productName}"`)
        return
      }
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { error } = await supabase
        .from('pos_products')
        .update({ image_url: imageUrl, image_source: 'auto' })
        .eq('id', productId)
      if (error) console.error(`[auto-fetch-image] update failed for "${productName}":`, error.message)
      else console.log(`[auto-fetch-image] saved image for "${productName}"`)
    })
    .catch(err => console.error(`[auto-fetch-image] fetch failed for "${productName}":`, err))
}