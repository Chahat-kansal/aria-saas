'use client'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { resolveProductIndustry, type ProductIndustryKind } from './registry'

export function useProductIndustry(): ProductIndustryKind {
  const { business } = useBusinessContext()
  const subtype = business?.industry_subtype ?? null
  const resolved = resolveProductIndustry(business?.industry, subtype)
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.debug('[useProductIndustry]', { industry: business?.industry, subtype, resolved })
  }
  return resolved
}
