'use client'
import { resolveRenderMode, type RenderModeProduct } from './productMode'
import { ProductHero } from './ProductHero'
import { ProductCustomiser } from './ProductCustomiser'
import { Spin360Viewer } from './Spin360Viewer'
import { resolveCoffeeSpin, resolveCoffeeBgMode } from '@/lib/drinkFills'

interface Props {
  product: RenderModeProduct
  imageSrc?: string
  videoSrc?: string
  name: string
  alt?: string
  size?: number
  sizeScale?: number
}

/**
 * 'build'    → ProductCustomiser
 * 'coffee'   → Spin360Viewer (drag-scrub 360° frames, still at rest)
 * 'standard' → ProductHero (floating hero image)
 */
export function ProductView({ product, imageSrc, videoSrc, name, alt, size, sizeScale = 1.0 }: Props) {
  const mode = resolveRenderMode(product)

  if (mode === 'build') {
    return <ProductCustomiser size={size} />
  }

  if (mode === 'coffee') {
    const spinSlug = resolveCoffeeSpin(product.ordering_archetype ?? '')
    if (spinSlug) {
      return <Spin360Viewer slug={spinSlug} bgMode={resolveCoffeeBgMode(spinSlug)} sizeScale={sizeScale} size={size ?? 320} />
    }
    // no spin yet for this archetype → fall through to hero
  }

  return (
    <ProductHero
      imageSrc={imageSrc ?? ''}
      videoSrc={videoSrc}
      name={name}
      alt={alt ?? name}
      size={size}
    />
  )
}