import { createClient } from '@supabase/supabase-js'
import { getRelevantImage } from '@/lib/images/pixabay'
import { removeBackgroundPhotoRoom } from './remove-background'

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
 * Fire-and-forget image fetcher for products without an image.
 *
 * Free path (free_remaining > 0): Pixabay/Unsplash scene photo, no bg removal.
 * Paid path (usePaidCredit: true): Pixabay source + PhotoRoom bg removal → transparent PNG.
 * No credits at all: stops silently (UI modal handles the choice).
 */
export function autoFetchProductImage(opts: {
  productId: string
  productName: string
  industry?: string | null
  businessId: string
  usePaidCredit?: boolean
}): void {
  const { productId, productName, industry, businessId, usePaidCredit = false } = opts

  const category: 'food' | 'all' =
    industry === 'cafe' || industry === 'restaurant' || industry === 'bakery' ? 'food' : 'all'

  const searchQuery =
    category === 'food' ? productName.toLowerCase() : `${productName} product`

  ;(async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
      const credits = await getImageCreditStatus(businessId)

      if (credits.free_remaining === 0 && !usePaidCredit) {
        console.log(`[auto-fetch-image] no free credits for "${productName}" — modal will handle`)
        return
      }
      if (usePaidCredit && credits.paid_credits === 0) {
        console.warn(`[auto-fetch-image] no paid credits for "${productName}"`)
        return
      }

      const sourceUrl = await getRelevantImage(searchQuery, { category, orientation: 'all', preferIsolated: usePaidCredit })
      if (!sourceUrl) {
        console.warn(`[auto-fetch-image] no source image for "${productName}"`)
        return
      }

      const safeName = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
      let finalBuffer: Buffer
      let storagePath: string
      let bgRemoved = false

      if (usePaidCredit) {
        finalBuffer = await removeBackgroundPhotoRoom(sourceUrl)
        storagePath = `owner-products/${productId}-${safeName}-transparent.png`
        bgRemoved = true
        await supabase.rpc('decrement_paid_credit', { bid: businessId })
      } else {
        const res = await fetch(sourceUrl)
        finalBuffer = Buffer.from(await res.arrayBuffer())
        storagePath = `owner-products/${productId}-${safeName}.jpg`
        await supabase.rpc('increment_free_used', { bid: businessId })
      }

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, finalBuffer, {
          contentType: bgRemoved ? 'image/png' : 'image/jpeg',
          upsert: true,
        })
      if (uploadError) {
        console.error(`[auto-fetch-image] upload failed for "${productName}":`, uploadError.message)
        return
      }

      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl

      await supabase
        .from('pos_products')
        .update({ image_url: publicUrl, image_source: bgRemoved ? 'photoroom' : 'auto' })
        .eq('id', productId)

      await supabase.from('pos_image_transactions').insert({
        business_id: businessId,
        product_id: productId,
        type: usePaidCredit ? 'paid_single' : 'free',
        bg_removed: bgRemoved,
        amount_charged: usePaidCredit ? 0.29 : 0,
      })

      console.log(`[auto-fetch-image] ✓ "${productName}" (bgRemoved: ${bgRemoved})`)
    } catch (err: unknown) {
      console.error(`[auto-fetch-image] error for "${productName}":`, err instanceof Error ? err.message : err)
    }
  })()
}