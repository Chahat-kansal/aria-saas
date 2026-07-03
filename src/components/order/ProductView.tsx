'use client'
import { resolveRenderMode, type RenderModeProduct } from './productMode'
import { ProductHero } from './ProductHero'
import { ProductCustomiser } from './ProductCustomiser'
import { Spin360Viewer } from './Spin360Viewer'
import { resolveCoffeeSpin, type DrinkType } from '@/lib/drinkFills'

interface Props {
  product: RenderModeProduct
  /** Required for standard mode */
  imageSrc?: string
  /** Optional spin/hero video for standard mode */
  videoSrc?: string
  name: string
  alt?: string
  /** Pixel size for hero or customiser burger stack */
  size?: number
  /** Scale for coffee spin: 0.9=Regular, 1.0=Large */
  sizeScale?: number
}

/**
 * Single switch MenuClient will call in ORD-3D-5.
 * 'build'    → ProductCustomiser (drag-to-build tray + price bar)
 * 'coffee'   → Spin360Viewer (360° photoreal frames, size=scale)
 * 'standard' → ProductHero (floating image or spin-video)
 */
export function ProductView({ product, imageSrc, videoSrc, name, alt, size, sizeScale = 1.0 }: Props) {
  const mode = resolveRenderMode(product)

  if (mode === 'build') {
    return <ProductCustomiser size={size} />
  }

  if (mode === 'coffee') {
    const spinSlug = resolveCoffeeSpin(product.ordering_archetype as DrinkType)
    if (spinSlug) {
      return <Spin360Viewer slug={spinSlug} sizeScale={sizeScale} size={size ?? 320} />
    }
    // No spin set yet for this drink → fall through to hero image
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