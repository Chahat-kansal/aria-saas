import { createServerSupabaseClient } from '@/lib/supabase-server'

const STORAGE_BUCKET = 'product-images'

export async function uploadProductImage(opts: {
  business_id: string
  product_id: string
  file: File | Buffer
  contentType?: string
}): Promise<string> {
  const supabase = createServerSupabaseClient()
  const ext = opts.contentType?.split('/')[1] ?? 'jpg'
  const path = `${opts.business_id}/${opts.product_id}.${ext}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, opts.file, {
      contentType: opts.contentType,
      upsert: true,
      cacheControl: '604800',
    })
  if (error) throw error
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function deleteProductImage(business_id: string, product_id: string) {
  const supabase = createServerSupabaseClient()
  const { data: files } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(business_id, { search: product_id })
  if (files?.length) {
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(files.map(f => `${business_id}/${f.name}`))
  }
}

export function getProductImageOrFallback(product: {
  image_url?: string | null
  image_source?: string | null
  name: string
  category?: string
  container_type?: string
}) {
  if (product.image_url && product.image_source !== 'pending') {
    return { type: 'photo' as const, url: product.image_url }
  }
  return { type: 'svg' as const }
}
