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

// Square POS light theme CSS vars — ONLY injected when light mode is active
// Dark mode uses aria-tokens.css html[data-theme="dark"] block (forest green theme)
const LIGHT_VARS: Record<string, string> = {
  '--bg-base':            '#F6F6F4',
  '--bg-canvas':          '#F0F0EE',
  '--bg-surface':         '#FFFFFF',
  '--bg-elevated':        '#FFFFFF',
  '--bg-overlay':         'rgba(255,255,255,0.97)',
  '--bg-hover':           '#F0F0EE',
  '--bg-active':          '#E8E8E6',
  '--bg-card':            '#FFFFFF',
  '--bg-input':           '#FFFFFF',
  '--bg-ghost':           '#FAFAFA',
  '--border-subtle':      '#EBEBEB',
  '--border-default':     '#D9D9D9',
  '--border-strong':      '#BABABA',
  '--border-violet':      'rgba(0,106,255,0.35)',
  '--divider':            '#EBEBEB',
  '--violet':             '#006AFF',
  '--violet-600':         '#0055CC',
  '--violet-700':         '#003D99',
  '--violet-dim':         'rgba(0,106,255,0.08)',
  '--violet-glow':        'rgba(0,106,255,0.16)',
  '--violet-soft':        'rgba(0,106,255,0.05)',
  '--cyan':               '#006AFF',
  '--green':              '#006AFF',
  '--text-primary':       '#1A1A1A',
  '--text-secondary':     '#6B6B6B',
  '--text-tertiary':      '#999999',
  '--text-violet':        '#006AFF',
  '--text-inverse':       '#FFFFFF',
  '--success':            '#00B140',
  '--success-bg':         'rgba(0,177,64,0.08)',
  '--warning':            '#B87503',
  '--warning-bg':         'rgba(184,117,3,0.08)',
  '--destructive':        '#FF1600',
  '--destructive-bg':     'rgba(255,22,0,0.06)',
  '--shadow-sm':          '0 1px 2px rgba(0,0,0,0.06)',
  '--shadow-md':          '0 2px 8px rgba(0,0,0,0.08)',
  '--shadow-lg':          '0 8px 24px rgba(0,0,0,0.10)',
  '--shadow-card':        '0 0 0 1px #EBEBEB, 0 1px 3px rgba(0,0,0,0.05)',
  '--pos-base':           '#F6F6F4',
  '--pos-surface':        '#FFFFFF',
  '--pos-elevated':       '#FFFFFF',
  '--pos-hover':          '#F0F0EE',
  '--pos-border-default': '#D9D9D9',
  '--pos-accent':         '#006AFF',
  '--pos-text-primary':   '#1A1A1A',
  '--pos-text-secondary': '#6B6B6B',
  '--pos-text-tertiary':  '#999999',
  '--pos-success':        '#00B140',
  '--pos-danger':         '#FF1600',
  '--sidebar-bg':         '#1A1A1A',
}

function applyLightVars() {
  const root = document.documentElement
  for (const [k, v] of Object.entries(LIGHT_VARS)) {
    root.style.setProperty(k, v)
  }
}

function removeLightVars() {
  const root = document.documentElement
  for (const k of Object.keys(LIGHT_VARS)) {
    root.style.removeProperty(k)
  }
}

export function POSThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<POSTheme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // Read saved preference
    const saved = (() => {
      try { return localStorage.getItem('pos_theme') as POSTheme } catch { return 'dark' }
    })()
    const initial: POSTheme = saved === 'light' ? 'light' : 'dark'

    setThemeState(initial)
    document.documentElement.setAttribute('data-theme', initial)

    // ONLY apply light vars if actually in light mode
    if (initial === 'light') {
      applyLightVars()
    } else {
      // Ensure no light vars are lingering
      removeLightVars()
    }

    // Watch for POSSidebar theme toggle (it sets html[data-theme])
    const observer = new MutationObserver(() => {
      const val = document.documentElement.getAttribute('data-theme') as POSTheme
      if (val === 'light') {
        setThemeState('light')
        applyLightVars()
      } else {
        setThemeState('dark')
        removeLightVars()
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  const setTheme = (t: POSTheme) => {
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)
    if (t === 'light') applyLightVars()
    else removeLightVars()
    try { localStorage.setItem('pos_theme', t) } catch { /* ignore */ }
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')
  const colors = getTheme(theme)

  if (!mounted) {
    // The anti-flash script (in root layout) has already applied the correct CSS vars
    // for the saved pos_theme. Use var(--bg-base) so we respect whatever the script set,
    // rather than hard-coding dark and causing a visible flash on light-mode refresh.
    return <div style={{ background: 'var(--bg-base, #030510)', minHeight: '100vh' }}>{children}</div>
  }

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      <div
        data-pos-theme={theme}
        style={{
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          minHeight: '100vh',
          transition: 'background 200ms ease, color 200ms ease',
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
