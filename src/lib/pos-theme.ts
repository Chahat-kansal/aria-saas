export type POSTheme = 'dark' | 'light'

export const DARK_THEME = {
  bg: '#030510', surface: '#0A0E1E', elevated: '#111628',
  border: '#1A2240', text: 'rgba(220,240,255,0.93)',
  muted: 'rgba(130,160,200,0.75)', dim: 'rgba(80,110,150,0.6)',
  accent: '#00E5FF', violet: '#8B5CF6', green: '#22C55E',
  red: '#EF4444', amber: '#F59E0B', card: '#0D1526',
  input: 'rgba(15,25,45,0.8)', sidebarBg: '#070D1C',
  sidebarText: 'rgba(180,210,255,0.85)',
  sidebarActive: 'rgba(0,229,255,0.08)',
}

export const LIGHT_THEME = {
  bg: '#F0F4F8', surface: '#FFFFFF', elevated: '#E8EEF5',
  border: '#CBD5E1', text: '#0F172A', muted: '#475569',
  dim: '#94A3B8', accent: '#0284C7', violet: '#7C3AED',
  green: '#15803D', red: '#DC2626', amber: '#B45309',
  card: '#FFFFFF', input: '#F8FAFC', sidebarBg: '#1E293B',
  sidebarText: 'rgba(248,250,252,0.9)',
  sidebarActive: 'rgba(2,132,199,0.15)',
}

export function getTheme(mode: POSTheme) {
  return mode === 'light' ? LIGHT_THEME : DARK_THEME
}

export type ThemeColors = typeof DARK_THEME
