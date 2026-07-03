'use client'
import { resolveRenderMode, type RenderModeProduct } from './productMode'
import { ProductHero } from './ProductHero'
import { ProductCustomiser } from './ProductCustomiser'

interface Props {
  product: RenderModeProduct
  imageSrc?: string
  videoSrc?: string
  name: string
  alt?: string
  size?: number
}

/**
 * 'build'    → ProductCustomiser (drag-to-build tray + price bar)
 * 'standard' → ProductHero (floating hero image or spin-video)
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