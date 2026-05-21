'use client'
import React, { createContext, useContext, useState, useEffect } from 'react'
import { POSTheme, getTheme, ThemeColors, DARK_THEME, LIGHT_THEME } from '@/lib/pos-theme'

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

// Read theme synchronously — runs before first render, no flash
function getInitialTheme(): POSTheme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const saved = localStorage.getItem('pos_theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  // Also check html[data-theme] set by anti-flash script
  try {
    const dom = document.documentElement.getAttribute('data-theme')
    if (dom === 'light' || dom === 'dark') return dom
  } catch { /* ignore */ }
  return 'dark'
}

export function POSThemeProvider({ children }: { children: React.ReactNode }) {
  // Read synchronously so first render matches saved preference
  const [theme, setThemeState] = useState<POSTheme>(getInitialTheme)

  // Sync both attributes whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-pos-theme-root', theme)
    try { localStorage.setItem('pos_theme', theme) } catch { /* ignore */ }
  }, [theme])

  const setTheme = (t: POSTheme) => {
    setThemeState(t)
    // Set immediately (don't wait for useEffect) so sidebar toggle is instant
    document.documentElement.setAttribute('data-theme', t)
    try { localStorage.setItem('pos_theme', t) } catch { /* ignore */ }
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')
  const colors = getTheme(theme)

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
