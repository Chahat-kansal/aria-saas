export type POSTheme = 'dark' | 'light';

export const DARK_THEME = {
  bg:              '#030510',
  surface:         '#0A0E1E',
  elevated:        '#111628',
  border:          '#1A2240',
  text:            'rgba(220,240,255,0.93)',
  muted:           'rgba(130,160,200,0.75)',
  dim:             'rgba(80,110,150,0.6)',
  accent:          '#00E5FF',
  violet:          '#8B5CF6',
  green:           '#22C55E',
  red:             '#EF4444',
  amber:           '#F59E0B',
  card:            '#0D1526',
  input:           'rgba(15,25,45,0.8)',
  sidebar:         '#070D1C',
  sidebarActive:   'rgba(0,229,255,0.08)',
  sidebarText:     'rgba(180,210,255,0.8)',
} as const;

export const LIGHT_THEME = {
  bg:              '#F8FAFC',
  surface:         '#FFFFFF',
  elevated:        '#F1F5F9',
  border:          '#E2E8F0',
  text:            '#0F172A',
  muted:           '#475569',
  dim:             '#94A3B8',
  accent:          '#0284C7',
  violet:          '#7C3AED',
  green:           '#16A34A',
  red:             '#DC2626',
  amber:           '#D97706',
  card:            '#FFFFFF',
  input:           '#F8FAFC',
  sidebar:         '#1E293B',
  sidebarActive:   'rgba(2,132,199,0.1)',
  sidebarText:     'rgba(248,250,252,0.9)',
} as const;

export function getTheme(mode: POSTheme) {
  return mode === 'light' ? LIGHT_THEME : DARK_THEME;
}
