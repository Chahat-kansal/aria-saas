'use client'
import { resolveRenderMode, type RenderModeProduct } from './productMode'
import { ProductHero } from './ProductHero'
import { ProductCustomiser } from './ProductCustomiser'

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
}

/**
 * Single switch MenuClient will call in ORD-3D-5.
 * 'build'    → ProductCustomiser (drag-to-build tray + price bar)
 * 'standard' → ProductHero (floating image or spin-video)
 */
export function ProductView({ product, imageSrc, videoSrc, name, alt, size }: Props) {
  const mode = resolveRenderMode(product)

  if (mode === 'build') {
    return <ProductCustomiser size={size} />
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