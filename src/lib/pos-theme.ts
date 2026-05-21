export type POSTheme = 'dark' | 'light'

export const DARK_THEME = {
  bg:          'var(--bg-base)',
  surface:     'var(--bg-canvas)',
  elevated:    'var(--bg-elevated)',
  border:      'transparent',
  text:        'var(--text-primary)',
  muted:       'var(--text-secondary)',
  dim:         'var(--text-tertiary)',
  accent:      '#00E5FF',
  violet:      '#8B5CF6',
  green:       '#22C55E',
  red:         '#EF4444',
  amber:       '#F59E0B',
  card:        'var(--bg-surface)',
  input:       'var(--bg-input)',
  sidebarBg:   'var(--bg-surface)',
  sidebarText: 'var(--text-primary)',
  sidebarActive: 'var(--violet-soft)',
}

// Square POS design system — exact colors from Block Inc.
export const LIGHT_THEME = {
  bg:          '#F6F6F4',   // Square warm off-white canvas
  surface:     '#F0F0EE',   // Square secondary surface
  elevated:    '#FFFFFF',   // Cards, modals
  border:      '#D9D9D9',   // Square standard border
  text:        '#1A1A1A',   // Square near-black text
  muted:       '#6B6B6B',   // Square secondary text
  dim:         '#999999',   // Square placeholder/tertiary
  accent:      '#006AFF',   // Square primary blue
  violet:      '#006AFF',   // Remap purple → Square blue
  green:       '#007A2C',   // Square success green (darkened for light bg)
  red:         '#CC1400',   // Square error red (darkened for light bg)
  amber:       '#8A5700',   // Square warning amber (darkened for light bg)
  card:        '#FFFFFF',   // Pure white cards
  input:       '#FFFFFF',   // Pure white inputs
  sidebarBg:   '#1A1A1A',   // Square sidebar stays dark
  sidebarText: '#FFFFFF',
  sidebarActive: 'rgba(255,255,255,0.12)',
}

export function getTheme(mode: POSTheme) {
  return mode === 'light' ? LIGHT_THEME : DARK_THEME
}

export type ThemeColors = typeof DARK_THEME
