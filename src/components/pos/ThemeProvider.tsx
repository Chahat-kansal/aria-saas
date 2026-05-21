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

// Square POS light theme CSS variables — injected onto :root when light mode active
const SQUARE_LIGHT_VARS: Record<string, string> = {
  '--bg-base':            '#F6F6F4',
  '--bg-canvas':          '#F0F0EE',
  '--bg-surface':         '#FFFFFF',
  '--bg-elevated':        '#FFFFFF',
  '--bg-overlay':         'rgba(255,255,255,0.97)',
  '--bg-hover':           '#F0F0EE',
  '--bg-active':          '#E8E8E6',
  '--bg-card':            '#FFFFFF',
  '--bg-input':           '#FFFFFF',
  '--bg-glass':           'rgba(255,255,255,0.95)',
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
  '--cyan-glow':          'rgba(0,106,255,0.16)',
  '--green':              '#006AFF',
  '--text-primary':       '#1A1A1A',
  '--text-secondary':     '#6B6B6B',
  '--text-tertiary':      '#999999',
  '--text-violet':        '#006AFF',
  '--text-cyan':          '#006AFF',
  '--text-inverse':       '#FFFFFF',
  '--success':            '#00B140',
  '--success-bg':         'rgba(0,177,64,0.08)',
  '--warning':            '#B87503',
  '--warning-bg':         'rgba(184,117,3,0.08)',
  '--destructive':        '#FF1600',
  '--destructive-bg':     'rgba(255,22,0,0.06)',
  '--info':               '#006AFF',
  '--info-bg':            'rgba(0,106,255,0.06)',
  '--shadow-sm':          '0 1px 2px rgba(0,0,0,0.06)',
  '--shadow-md':          '0 2px 8px rgba(0,0,0,0.08)',
  '--shadow-lg':          '0 8px 24px rgba(0,0,0,0.10)',
  '--shadow-card':        '0 0 0 1px #EBEBEB, 0 1px 3px rgba(0,0,0,0.05)',
  '--shadow-violet':      '0 4px 16px rgba(0,106,255,0.16)',
  '--pos-base':           '#F6F6F4',
  '--pos-surface':        '#FFFFFF',
  '--pos-elevated':       '#FFFFFF',
  '--pos-hover':          '#F0F0EE',
  '--pos-active':         '#E8E8E6',
  '--pos-border-subtle':  '#EBEBEB',
  '--pos-border-default': '#D9D9D9',
  '--pos-border-strong':  '#BABABA',
  '--pos-border-accent':  'rgba(0,106,255,0.35)',
  '--pos-border-teal':    'rgba(0,106,255,0.25)',
  '--pos-border-violet':  'rgba(0,106,255,0.35)',
  '--pos-accent':         '#006AFF',
  '--pos-accent-600':     '#0055CC',
  '--pos-accent-dim':     'rgba(0,106,255,0.08)',
  '--pos-accent-glow':    'rgba(0,106,255,0.16)',
  '--pos-teal':           '#006AFF',
  '--pos-teal-600':       '#0055CC',
  '--pos-teal-dim':       'rgba(0,106,255,0.08)',
  '--pos-teal-glow':      'rgba(0,106,255,0.16)',
  '--pos-text-primary':   '#1A1A1A',
  '--pos-text-secondary': '#6B6B6B',
  '--pos-text-tertiary':  '#999999',
  '--pos-text-1':         '#1A1A1A',
  '--pos-text-2':         '#6B6B6B',
  '--pos-text-3':         '#999999',
  '--pos-success':        '#00B140',
  '--pos-warning':        '#B87503',
  '--pos-danger':         '#FF1600',
  '--gradient-aria':      'linear-gradient(135deg, #006AFF 0%, #0055CC 100%)',
  '--bg-aurora':          'none',
}

// Store original dark values so we can restore them
let darkVarCache: Record<string, string> = {}

function applyLightVars() {
  const root = document.documentElement
  // Cache dark values on first call
  if (Object.keys(darkVarCache).length === 0) {
    const computed = getComputedStyle(root)
    for (const key of Object.keys(SQUARE_LIGHT_VARS)) {
      darkVarCache[key] = computed.getPropertyValue(key).trim()
    }
  }
  for (const [key, val] of Object.entries(SQUARE_LIGHT_VARS)) {
    root.style.setProperty(key, val)
  }
}

function removeLightVars() {
  const root = document.documentElement
  for (const key of Object.keys(SQUARE_LIGHT_VARS)) {
    root.style.removeProperty(key)
  }
}

export function POSThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<POSTheme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = (() => {
      try { return localStorage.getItem('pos_theme') as POSTheme } catch { return 'dark' }
    })()
    const initial = (saved === 'light' || saved === 'dark') ? saved : 'dark'
    setThemeState(initial)
    document.documentElement.setAttribute('data-theme', initial)
    if (initial === 'light') applyLightVars()

    // Watch for changes from POSSidebar (which also toggles theme)
    const observer = new MutationObserver(() => {
      const val = document.documentElement.getAttribute('data-theme') as POSTheme
      if (val === 'light' || val === 'dark') {
        setThemeState(val)
        if (val === 'light') applyLightVars()
        else removeLightVars()
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
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
    return <div style={{ background: '#030510', minHeight: '100vh' }}>{children}</div>
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
