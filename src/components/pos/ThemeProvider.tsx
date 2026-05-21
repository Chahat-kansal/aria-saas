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

export function POSThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<POSTheme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // Read saved theme
    const readTheme = (): POSTheme => {
      try {
        const saved = localStorage.getItem('pos_theme') as POSTheme
        if (saved === 'light' || saved === 'dark') return saved
      } catch { /* ignore */ }
      // Also check html[data-theme] attribute set by anti-flash script
      const attr = document.documentElement.getAttribute('data-theme')
      if (attr === 'light' || attr === 'dark') return attr
      return 'dark'
    }

    const t = readTheme()
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)

    // Listen for changes from POSSidebar (which writes to localStorage + html[data-theme])
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pos_theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue as POSTheme)
        document.documentElement.setAttribute('data-theme', e.newValue)
      }
    }

    // Also observe html[data-theme] attribute changes directly
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme') {
          const val = document.documentElement.getAttribute('data-theme')
          if (val === 'light' || val === 'dark') {
            setThemeState(val as POSTheme)
          }
        }
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener('storage', onStorage)
      observer.disconnect()
    }
  }, [])

  const setTheme = (t: POSTheme) => {
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)
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
