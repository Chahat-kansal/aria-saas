'use client'
import { ContainerType } from '@/lib/container-detect'

type Props = {
  name: string
  category: string
  container: ContainerType
  color?: string
  size?: number
}

const CATEGORY_COLORS: Record<string, string> = {
  'beer': '#B8854A',
  'whisky': '#8B5A2B',
  'wine-red': '#7B4754',
  'wine-white': '#9C9560',
  'spirits': '#94795E',
  'liqueur': '#A85F3F',
  'coffee': '#6B4423',
  'snacks': '#D4A95E',
  'mixer': '#6B96B0',
  'other': '#7FB897',
}

function darken(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`
}

function lighten(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * factor))},${Math.min(255, Math.round(g + (255 - g) * factor))},${Math.min(255, Math.round(b + (255 - b) * factor))})`
}

export function ProductBottle({ name, category, container, color, size = 100 }: Props) {
  const c = color ?? CATEGORY_COLORS[category] ?? '#7FB897'
  const cDark = darken(c, 0.6)
  const safeName = name.split(' ')[0].slice(0, 9)

  if (container === 'can') {
    return (
      <svg width={size * 0.55} height={size} viewBox="0 0 60 100"
           style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))' }}>
        <ellipse cx="30" cy="3" rx="14" ry="2" fill={cDark}/>
        <rect x="16" y="3" width="28" height="6" fill={cDark}/>
        <rect x="14" y="9" width="32" height="86" fill={c}/>
        <ellipse cx="30" cy="95" rx="16" ry="2" fill={cDark}/>
        <rect x="16" y="35" width="28" height="44" fill="white" opacity="0.95"/>
        <text x="30" y="55" fontFamily="Impact" fontSize="9"
              fill={cDark} textAnchor="middle" fontWeight="bold">
          {safeName.toUpperCase()}
        </text>
        <rect x="18" y="60" width="24" height="1" fill={cDark} opacity="0.6"/>
        <text x="30" y="68" fontFamily="Georgia" fontSize="3.5"
              fill={cDark} textAnchor="middle" opacity="0.7">EST. AU</text>
        <ellipse cx="18" cy="48" rx="1.5" ry="20" fill="white" opacity="0.4"/>
      </svg>
    )
  }

  if (container === 'case') {
    return (
      <svg width={size * 0.95} height={size * 0.7} viewBox="0 0 90 70"
           style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))' }}>
        <path d="M5 18 L45 5 L85 18 L85 60 L45 70 L5 60 Z" fill={c}/>
        <path d="M5 18 L45 30 L85 18" fill="none" stroke="white"
              strokeOpacity="0.3" strokeWidth="0.8"/>
        <path d="M45 30 L45 70" stroke="white" strokeOpacity="0.2" strokeWidth="0.8"/>
        <rect x="25" y="38" width="40" height="22" fill="white" opacity="0.92" rx="1"/>
        <text x="45" y="52" fontFamily="Impact" fontSize="9"
              fill={cDark} textAnchor="middle" fontWeight="bold">
          {safeName.toUpperCase()}
        </text>
        <text x="45" y="58" fontFamily="Georgia" fontSize="3.5"
              fill={cDark} textAnchor="middle">CASE</text>
      </svg>
    )
  }

  if (container === 'cask') {
    return (
      <svg width={size * 0.7} height={size} viewBox="0 0 70 100"
           style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))' }}>
        <rect x="5" y="20" width="60" height="60" rx="3" fill={c}/>
        <rect x="10" y="32" width="50" height="36" fill="white" opacity="0.95" rx="1"/>
        <text x="35" y="48" fontFamily="Georgia" fontSize="9"
              fill={cDark} textAnchor="middle" fontStyle="italic"
              fontWeight="bold">{safeName}</text>
        <text x="35" y="60" fontFamily="Georgia" fontSize="4"
              fill={cDark} textAnchor="middle">CASK · 4L</text>
      </svg>
    )
  }

  const isWine = category.startsWith('wine')
  return (
    <svg width={size * 0.6} height={size} viewBox="0 0 60 100"
         style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))' }}>
      <rect x="26" y="0" width="8" height={isWine ? "12" : "8"} fill={cDark}/>
      <rect x="24" y={isWine ? "12" : "8"} width="12" height="6" fill={cDark}/>
      {isWine ? (
        <path d="M24 18 L24 32 Q14 36 14 48 L14 96 Q14 100 18 100 L42 100 Q46 100 46 96 L46 48 Q46 36 36 32 L36 18 Z" fill={c}/>
      ) : (
        <path d="M22 14 L22 26 L18 32 L18 96 Q18 100 22 100 L38 100 Q42 100 42 96 L42 32 L38 26 L38 14 Z" fill={c}/>
      )}
      <rect x="16" y={isWine ? "55" : "40"} width="28"
            height={isWine ? "32" : "44"} fill="white" opacity="0.95" rx="1"/>
      <text x="30" y={isWine ? "70" : "60"} fontFamily="Georgia"
            fontSize="7" fill={cDark} textAnchor="middle"
            fontStyle="italic" fontWeight="bold">{safeName}</text>
      <rect x="18" y={isWine ? "76" : "66"} width="24" height="0.8"
            fill={cDark} opacity="0.6"/>
      <text x="30" y={isWine ? "82" : "74"} fontFamily="Georgia"
            fontSize="3.5" fill={cDark} textAnchor="middle">
        {isWine ? '2024' : 'AU'}
      </text>
      <ellipse cx="18" cy={isWine ? "60" : "50"} rx="1.5"
               ry={isWine ? "20" : "26"} fill="white" opacity="0.35"/>
    </svg>
  )
}
