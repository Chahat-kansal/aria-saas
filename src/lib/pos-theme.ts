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

export const LIGHT_THEME = {
  bg:          'var(--bg-base)',
  surface:     'var(--bg-canvas)',
  elevated:    'var(--bg-elevated)',
  border:      'transparent',
  text:        'var(--text-primary)',
  muted:       'var(--text-secondary)',
  dim:         'var(--text-tertiary)',
  accent:      '#0284C7',
  violet:      '#7C3AED',
  green:       '#15803D',
  red:         '#DC2626',
  amber:       '#B45309',
  card:        'var(--bg-surface)',
  input:       'var(--bg-input)',
  sidebarBg:   'var(--bg-surface)',
  sidebarText: 'var(--text-primary)',
  sidebarActive: 'var(--violet-soft)',
}

export function getTheme(mode: POSTheme) {
  return mode === 'light' ? LIGHT_THEME : DARK_THEME
}

export type ThemeColors = typeof DARK_THEME
