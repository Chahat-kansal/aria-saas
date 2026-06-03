'use client'
import { createContext, useContext } from 'react'

export const ReadOnlyContext = createContext(false)
export const useReadOnly = () => useContext(ReadOnlyContext)

export function ReadOnlyProvider({ children }: { children: React.ReactNode }) {
  return <ReadOnlyContext.Provider value={true}>{children}</ReadOnlyContext.Provider>
}
