'use client'
import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
type Ctx = { theme: Theme; setTheme: (t: Theme) => void }

const ThemeCtx = createContext<Ctx>({ theme: 'dark', setTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const saved = (localStorage.getItem('aria-theme') as Theme | null) ?? 'dark'
    setThemeState(saved)
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('aria-theme', theme)
  }, [theme])

  return (
    <ThemeCtx.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme()
  const opts: { id: Theme; icon: string; label: string }[] = [
    { id: 'light', icon: '☀️', label: 'Light' },
    { id: 'dark',  icon: '🌙', label: 'Dark'  },
  ]

  if (collapsed) {
    return (
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title="Toggle theme"
        style={{
          width: 36, height: 28, borderRadius: 10,
          background: 'var(--bg-elevated)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
          fontSize: 14, transition: 'all 200ms var(--ease)',
        }}
      >
        {theme === 'dark' ? '🌙' : '☀️'}
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-elevated)',
      borderRadius: 10,
      padding: 3,
      gap: 2,
      boxShadow: 'var(--shadow-sm)',
    }}>
      {opts.map(o => {
        const on = theme === o.id
        return (
          <button
            key={o.id}
            onClick={() => setTheme(o.id)}
            style={{
              flex: 1, height: 28, borderRadius: 8,
              cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 5,
              background: on ? 'var(--bg-surface)' : 'transparent',
              color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: on ? 'var(--shadow-sm)' : 'none',
              transition: 'all 200ms var(--ease)',
              whiteSpace: 'nowrap',
              paddingLeft: 10, paddingRight: 10,
            }}
          >
            <span>{o.icon}</span>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
