'use client'
import { createContext, useContext } from 'react'

export interface OwnerBusiness {
  id: string
  slug: string
  name: string
  suburb: string | null
}

const OwnerBusinessCtx = createContext<OwnerBusiness | null>(null)

export function OwnerBusinessProvider({ business, children }: { business: OwnerBusiness; children: React.ReactNode }) {
  return <OwnerBusinessCtx.Provider value={business}>{children}</OwnerBusinessCtx.Provider>
}

export function useOwnerBusiness(): OwnerBusiness {
  const ctx = useContext(OwnerBusinessCtx)
  if (!ctx) throw new Error('useOwnerBusiness must be used within /owner/[slug]')
  return ctx
}
