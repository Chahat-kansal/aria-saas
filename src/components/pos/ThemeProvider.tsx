'use client';
import { useState, useEffect, createContext, useContext } from 'react';
import { POSTheme, getTheme } from '@/lib/pos-theme';

type Colors = ReturnType<typeof getTheme>;

interface ThemeContextValue {
  theme: POSTheme;
  colors: Colors;
  toggleTheme: () => void;
  setTheme: (t: POSTheme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function usePOSTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('usePOSTheme must be used inside POSThemeProvider');
  return ctx;
}

export function POSThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<POSTheme>('dark');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pos_theme') as POSTheme;
      if (saved === 'light' || saved === 'dark') {
        setThemeState(saved);
        document.documentElement.setAttribute('data-pos-theme', saved);
      }
    } catch { /* ignore */ }
  }, []);

  function setTheme(t: POSTheme) {
    setThemeState(t);
    try {
      localStorage.setItem('pos_theme', t);
      document.documentElement.setAttribute('data-pos-theme', t);
    } catch { /* ignore */ }
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  const colors = getTheme(theme);

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      <div
        data-pos-theme={theme}
        style={{
          background: colors.bg,
          color: colors.text,
          minHeight: '100vh',
          transition: 'background 200ms ease, color 200ms ease',
          fontFamily: "'Manrope', system-ui, sans-serif",
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
