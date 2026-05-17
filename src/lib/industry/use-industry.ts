'use client'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { resolveProductIndustry, type ProductIndustryKind } from './registry'

export function useProductIndustry(): ProductIndustryKind {
  const { business } = useBusinessContext()
  const subtype = (business as { industry_subtype?: string | null } | null)?.industry_subtype
  return resolveProductIndustry(business?.industry, subtype)
}
