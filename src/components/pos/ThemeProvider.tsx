'use client'
import React, { createContext, useContext, useState, useEffect } from 'react'
import { POSTheme, getTheme, ThemeColors, DARK_THEME } from '@/lib/pos-theme'

interface ThemeContextValue {
  theme: POSTheme
  colors: ThemeColors
  toggleTheme: () => void
  setTheme: (t: POSTheme) => void
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  colors: DARK_THEME,
  toggleTheme: () => {},
  setTheme: () => {},
})

export function usePOSTheme() {
  return useContext(ThemeContext)
}

export function POSThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<POSTheme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem('pos_theme') as POSTheme
      if (saved === 'light' || saved === 'dark') setThemeState(saved)
    } catch { /* ignore */ }
  }, [])

  const setTheme = (t: POSTheme) => {
    setThemeState(t)
    try { localStorage.setItem('pos_theme', t) } catch { /* ignore */ }
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')
  const colors = getTheme(theme)

  if (!mounted) {
    return <div style={{ background: '#030510', minHeight: '100vh' }}>{children}</div>
  }

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      <div
        data-pos-theme={theme}
        style={{
          background: colors.bg,
          color: colors.text,
          minHeight: '100vh',
          transition: 'background 200ms ease, color 200ms ease',
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
