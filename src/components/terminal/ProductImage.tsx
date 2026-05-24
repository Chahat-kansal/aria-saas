'use client'
import { useMemo } from 'react'

interface ProductLike {
  id: string
  name: string
  brand?: string | null
  category?: string | null
  container_type?: string | null
  image_url?: string | null
  image_source?: string | null
}

interface Props {
  product: ProductLike
  size?: number
  showShadow?: boolean
}

type Colors = { glass: [string, string, string]; labelBg: string; labelText: string; accent: string }

const BRAND: Record<string, Colors> = {
  'carlton':        { glass: ['#3a2615','#7B4720','#A8662F'], labelBg: '#0F4D2C', labelText: '#E8B85C', accent: '#E8B85C' },
  'vb':             { glass: ['#3D2614','#7B4720','#A8662F'], labelBg: '#054A2C', labelText: '#E8B85C', accent: '#E8B85C' },
  'victoria bitter':{ glass: ['#3D2614','#7B4720','#A8662F'], labelBg: '#054A2C', labelText: '#E8B85C', accent: '#E8B85C' },
  'coopers':        { glass: ['#241509','#5C2F18','#834326'], labelBg: '#F0E2BC', labelText: '#A03020', accent: '#A03020' },
  'heineken':       { glass: ['#0A3D1F','#1F7A3E','#2BA055'], labelBg: '#0A3D1F', labelText: 'white',   accent: '#C8102E' },
  'corona':         { glass: ['#C9A562','#F5E6B8','#FAEDD2'], labelBg: '#FAEDD2', labelText: '#1A4D7A', accent: '#D4A04A' },
  'wild turkey':    { glass: ['#5a2812','#9B4A20','#C8732A'], labelBg: '#F4E4C4', labelText: '#5a2812', accent: '#8a6a3a' },
  'jim beam':       { glass: ['#3D1A0A','#7B341A','#A85428'], labelBg: '#1C0D05', labelText: '#E8B85C', accent: '#E8B85C' },
  'jack daniels':   { glass: ['#1A0D05','#3D1F0E','#5C2F1A'], labelBg: '#0A0A0A', labelText: '#E8B85C', accent: '#E8B85C' },
  'jack daniel':    { glass: ['#1A0D05','#3D1F0E','#5C2F1A'], labelBg: '#0A0A0A', labelText: '#E8B85C', accent: '#E8B85C' },
  'absolut':        { glass: ['rgba(180,200,210,0.3)','rgba(220,235,240,0.55)','rgba(180,200,210,0.3)'], labelBg: 'transparent', labelText: '#0F2D1F', accent: '#0F2D1F' },
  'smirnoff':       { glass: ['rgba(180,200,210,0.3)','rgba(220,235,240,0.55)','rgba(180,200,210,0.3)'], labelBg: 'transparent', labelText: '#A01030', accent: '#A01030' },
  'wakefield':      { glass: ['#3D5840','#7B9C7E','#A0BAA0'], labelBg: '#F8F2DC', labelText: '#3D5840', accent: '#8a7a4a' },
  'penfolds':       { glass: ['#1A0A0A','#3F1414','#5F1F1F'], labelBg: '#0F0E0C', labelText: '#E8B85C', accent: '#E8B85C' },
  "jacob's creek":  { glass: ['#1A0A0A','#3F1414','#5F1F1F'], labelBg: '#F8F2DC', labelText: '#3D5840', accent: '#8a7a4a' },
  'monster':        { glass: ['#000','#1a1a1a','#2a2a2a'],    labelBg: '#000',     labelText: '#9DD432', accent: '#9DD432' },
  'red bull':       { glass: ['#0a1a4a','#1a3a8a','#2a5acc'], labelBg: '#1a3a8a', labelText: 'white',   accent: '#C8102E' },
  'coca cola':      { glass: ['#3a0606','#7a1414','#A01818'], labelBg: '#A01818', labelText: 'white',   accent: 'white' },
  'coke':           { glass: ['#3a0606','#7a1414','#A01818'], labelBg: '#A01818', labelText: 'white',   accent: 'white' },
  'pepsi':          { glass: ['#0a1a4a','#1a2a6a','#2a3a8a'], labelBg: '#0a1a4a', labelText: 'white',   accent: '#C8102E' },
  'tooheys':        { glass: ['#1a1a3a','#2a2a5a','#4a4a8a'], labelBg: '#1a1a3a', labelText: '#E8B85C', accent: '#E8B85C' },
  'james squire':   { glass: ['#3a2010','#704028','#9A6040'], labelBg: '#F0DEC0', labelText: '#3a2010', accent: '#9A6040' },
  'fourex':         { glass: ['#1a3a1a','#2a5a2a','#3a7a3a'], labelBg: '#E8C020', labelText: '#1a3a1a', accent: '#1a3a1a' },
  'xxxx':           { glass: ['#1a3a1a','#2a5a2a','#3a7a3a'], labelBg: '#E8C020', labelText: '#1a3a1a', accent: '#1a3a1a' },
}

const CATEGORY: Record<string, Colors> = {
  'beer':       { glass: ['#3a2615','#7B4720','#A8662F'], labelBg: '#5C2F18', labelText: '#E8B85C', accent: '#E8B85C' },
  'beer & cider':{ glass: ['#3a2615','#7B4720','#A8662F'], labelBg: '#5C2F18', labelText: '#E8B85C', accent: '#E8B85C' },
  'wine':       { glass: ['#3D5840','#7B9C7E','#A0BAA0'], labelBg: '#F8F2DC', labelText: '#3D5840', accent: '#8a7a4a' },
  'wine-red':   { glass: ['#1A0A0A','#3F1414','#5F1F1F'], labelBg: '#0F0E0C', labelText: '#E8B85C', accent: '#E8B85C' },
  'wine-white': { glass: ['#3D5840','#7B9C7E','#A0BAA0'], labelBg: '#F8F2DC', labelText: '#3D5840', accent: '#8a7a4a' },
  'spirits':    { glass: ['#5a2812','#9B4A20','#C8732A'], labelBg: '#F4E4C4', labelText: '#5a2812', accent: '#8a6a3a' },
  'whisky':     { glass: ['#5a2812','#9B4A20','#C8732A'], labelBg: '#F4E4C4', labelText: '#5a2812', accent: '#8a6a3a' },
  'vodka':      { glass: ['rgba(180,200,210,0.3)','rgba(220,235,240,0.55)','rgba(180,200,210,0.3)'], labelBg: 'transparent', labelText: '#0F2D1F', accent: '#0F2D1F' },
  'gin':        { glass: ['rgba(180,200,210,0.3)','rgba(220,235,240,0.55)','rgba(180,200,210,0.3)'], labelBg: 'transparent', labelText: '#1A4D7A', accent: '#1A4D7A' },
  'rtd':        { glass: ['#3a2615','#7B4720','#A8662F'], labelBg: '#5C2F18', labelText: '#E8B85C', accent: '#E8B85C' },
  'energy drinks':{ glass: ['#000','#1a1a1a','#2a2a2a'], labelBg: '#000', labelText: '#9DD432', accent: '#9DD432' },
  'soft drinks':{ glass: ['#3a0606','#7a1414','#A01818'], labelBg: '#A01818', labelText: 'white', accent: 'white' },
  'water':      { glass: ['rgba(180,200,220,0.25)','rgba(210,230,245,0.5)','rgba(180,200,220,0.25)'], labelBg: 'transparent', labelText: '#1A4D7A', accent: '#1A4D7A' },
  'snacks':     { glass: ['#8a6a3a','#C8A464','#E8C480'], labelBg: '#5C3F18', labelText: '#F8E8C8', accent: '#E8B85C' },
  'other':      { glass: ['#3a4a3e','#5c7064','#7c9684'], labelBg: '#1f2e22', labelText: '#C7E0D0', accent: '#7FB897' },
}

function pickColors(product: ProductLike): Colors {
  const brandKey = (product.brand ?? '').toLowerCase().trim()
  if (brandKey && BRAND[brandKey]) return BRAND[brandKey]
  const name = product.name.toLowerCase()
  for (const [k, v] of Object.entries(BRAND)) {
    if (name.includes(k)) return v
  }
  const cat = (product.category ?? 'other').toLowerCase()
  return CATEGORY[cat] ?? CATEGORY['other']
}

function pickTemplate(product: ProductLike): string {
  const cat = (product.category ?? '').toLowerCase()
  const ct  = (product.container_type ?? '').toLowerCase()
  const name = product.name.toLowerCase()
  if (ct === 'can')    return name.match(/440|500|big/) ? 'can-440' : 'can-355'
  if (ct === 'bottle' || ct === 'longneck') {
    if (cat.includes('wine')) return cat.includes('white') ? 'wine-burgundy' : 'wine-bordeaux'
    if (cat.match(/whisky|spirit|vodka|gin/)) return 'spirit-wide'
    return 'beer-longneck'
  }
  if (ct === 'stubby') return 'beer-stubby'
  if (cat.match(/energy|soft drink|rtd/)) return 'can-355'
  if (cat.includes('white')) return 'wine-burgundy'
  if (cat.match(/wine-red|wine/)) return 'wine-bordeaux'
  if (cat.match(/whisky|spirit|vodka|gin/)) return 'spirit-wide'
  if (cat.includes('beer')) return 'beer-longneck'
  if (cat === 'snacks') return 'generic'
  if (name.match(/can|red bull|monster|energy/)) return 'can-355'
  if (name.match(/wine|sauv|chard|shiraz|cab/)) return 'wine-bordeaux'
  if (name.match(/whisky|whiskey|bourbon|scotch/)) return 'spirit-wide'
  return 'beer-longneck'
}

function gradientId(base: string, pid: string) { return `${base}-${pid.replace(/[^a-z0-9]/gi, '')}` }

function BottleSvg({ colors, labelA, labelB, size, pid, neck = 25 }: {
  colors: Colors; labelA: string; labelB: string; size: number; pid: string; neck?: number
}) {
  const gid = gradientId('btl', pid)
  return (
    <svg viewBox="0 0 60 100" style={{ height: size, width: 'auto' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={colors.glass[0]}/>
          <stop offset="38%"  stopColor={colors.glass[1]}/>
          <stop offset="55%"  stopColor={colors.glass[2]}/>
          <stop offset="75%"  stopColor={colors.glass[1]}/>
          <stop offset="100%" stopColor={colors.glass[0]}/>
        </linearGradient>
      </defs>
      <path d={`M ${neck} 6 L ${neck} 20 Q ${neck-3} 24 ${neck-3} 32 L ${neck-3} 92 Q ${neck-3} 96 ${neck+1} 96 L ${60-neck-1} 96 Q ${60-neck+3} 96 ${60-neck+3} 92 L ${60-neck+3} 32 Q ${60-neck+3} 24 ${60-neck} 20 L ${60-neck} 6 Z`}
            fill={`url(#${gid})`} stroke="rgba(0,0,0,0.45)" strokeWidth="0.5"/>
      <rect x="22" y="50" width="16" height="34" fill={colors.labelBg === 'transparent' ? 'rgba(0,0,0,0.1)' : colors.labelBg}/>
      <text x="30" y="62" fontFamily="serif" fontSize="4" fontWeight="700" fontStyle="italic"
            fill={colors.labelText} textAnchor="middle">{labelA.slice(0,10)}</text>
      <text x="30" y="70" fontFamily="sans-serif" fontSize="2.8" fontWeight="500" letterSpacing="0.5"
            fill={colors.accent} textAnchor="middle">{labelB.slice(0,12).toUpperCase()}</text>
      <path d={`M ${neck+1} 26 Q ${neck+2} 58 ${neck+4} 92`} stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

function WineSvg({ colors, labelA, labelB, size, pid }: { colors: Colors; labelA: string; labelB: string; size: number; pid: string }) {
  const gid = gradientId('wine', pid)
  return (
    <svg viewBox="0 0 60 100" style={{ height: size, width: 'auto' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={colors.glass[0]}/>
          <stop offset="38%"  stopColor={colors.glass[1]}/>
          <stop offset="55%"  stopColor={colors.glass[2]}/>
          <stop offset="72%"  stopColor={colors.glass[1]}/>
          <stop offset="100%" stopColor={colors.glass[0]}/>
        </linearGradient>
      </defs>
      <path d="M 28 6 L 28 22 Q 25 26 25 36 L 22 46 Q 20 52 20 58 L 20 92 Q 20 96 24 96 L 36 96 Q 40 96 40 92 L 40 58 Q 40 52 38 46 L 35 36 Q 35 26 32 22 L 32 6 Z"
            fill={`url(#${gid})`} stroke="rgba(0,0,0,0.45)" strokeWidth="0.5"/>
      <rect x="25" y="2" width="10" height="14" fill="#0a0a0a"/>
      <rect x="20" y="60" width="20" height="28" fill={colors.labelBg === 'transparent' ? 'rgba(0,0,0,0.1)' : colors.labelBg} stroke={colors.accent} strokeWidth="0.3"/>
      <text x="30" y="70" fontFamily="serif" fontSize="3.2" fontWeight="600" fontStyle="italic"
            fill={colors.labelText} textAnchor="middle">{labelA.slice(0,12)}</text>
      <text x="30" y="78" fontFamily="serif" fontSize="2.6"
            fill={colors.labelText} textAnchor="middle">{labelB.slice(0,14)}</text>
      <path d="M 23 50 Q 24 70 26 90" stroke="rgba(255,255,255,0.22)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

function SpiritSvg({ colors, labelA, labelB, size, pid }: { colors: Colors; labelA: string; labelB: string; size: number; pid: string }) {
  const gid = gradientId('spr', pid)
  return (
    <svg viewBox="0 0 60 100" style={{ height: size, width: 'auto' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={colors.glass[0]}/>
          <stop offset="38%"  stopColor={colors.glass[1]}/>
          <stop offset="55%"  stopColor={colors.glass[2]}/>
          <stop offset="72%"  stopColor={colors.glass[1]}/>
          <stop offset="100%" stopColor={colors.glass[0]}/>
        </linearGradient>
      </defs>
      <path d="M 25 6 L 25 16 Q 22 20 22 26 L 18 32 Q 16 36 16 42 L 16 90 Q 16 96 22 96 L 38 96 Q 44 96 44 90 L 44 42 Q 44 36 42 32 L 38 26 Q 38 20 35 16 L 35 6 Z"
            fill={`url(#${gid})`} stroke="rgba(0,0,0,0.45)" strokeWidth="0.5"/>
      <rect x="24" y="2" width="12" height="6" rx="1" fill="rgba(0,0,0,0.85)"/>
      <rect x="17" y="50" width="26" height="34" fill={colors.labelBg === 'transparent' ? 'rgba(0,0,0,0.1)' : colors.labelBg} stroke={colors.accent} strokeWidth="0.3"/>
      <text x="30" y="61" fontFamily="serif" fontSize="4.5" fontWeight="700"
            fill={colors.labelText} textAnchor="middle">{labelA.slice(0,8).toUpperCase()}</text>
      <text x="30" y="70" fontFamily="serif" fontSize="4" fontWeight="700"
            fill={colors.labelText} textAnchor="middle">{labelB.slice(0,8).toUpperCase()}</text>
      <path d="M 19 32 Q 20 60 22 88" stroke="rgba(255,255,255,0.22)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

function CanSvg({ colors, labelA, labelB, size, pid }: { colors: Colors; labelA: string; labelB: string; size: number; pid: string }) {
  const gid = gradientId('can', pid)
  return (
    <svg viewBox="0 0 60 100" style={{ height: size, width: 'auto' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={colors.glass[0]}/>
          <stop offset="40%"  stopColor={colors.glass[1]}/>
          <stop offset="55%"  stopColor={colors.glass[2]}/>
          <stop offset="70%"  stopColor={colors.glass[1]}/>
          <stop offset="100%" stopColor={colors.glass[0]}/>
        </linearGradient>
      </defs>
      <ellipse cx="30" cy="14" rx="14" ry="2.5" fill="rgba(120,130,135,0.9)"/>
      <rect x="16" y="14" width="28" height="74" fill={`url(#${gid})`}/>
      <ellipse cx="30" cy="88" rx="14" ry="2.5" fill={colors.glass[0]}/>
      <ellipse cx="30" cy="13" rx="13" ry="1.6" fill="rgba(150,160,165,0.9)"/>
      <rect x="27" y="11" width="6" height="2" rx="1" fill="rgba(120,130,135,0.9)"/>
      <text x="30" y="52" fontFamily="serif" fontSize="4" fontWeight="700" fontStyle="italic"
            fill={colors.accent} textAnchor="middle">{labelA.slice(0,10)}</text>
      <text x="30" y="61" fontFamily="sans-serif" fontSize="2.6" fontWeight="600" letterSpacing="0.5"
            fill={colors.labelText === 'transparent' ? 'white' : colors.labelText} textAnchor="middle">{labelB.slice(0,14).toUpperCase()}</text>
      <rect x="19" y="14" width="2.5" height="74" fill="rgba(255,255,255,0.18)"/>
      <rect x="38" y="14" width="2"   height="74" fill="rgba(0,0,0,0.15)"/>
    </svg>
  )
}

function GenericBlock({ colors, label, size }: { colors: Colors; label: string; size: number }) {
  return (
    <div style={{
      width: size * 0.7, height: size,
      borderRadius: 10,
      background: `linear-gradient(135deg, ${colors.glass[0]}, ${colors.glass[1]} 50%, ${colors.glass[0]})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: colors.labelText, fontFamily: "'Instrument Serif',Georgia,serif",
      fontStyle: 'italic', fontWeight: 700, fontSize: size * 0.3,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
    }}>
      {label.charAt(0).toUpperCase()}
    </div>
  )
}

export function ProductImage({ product, size = 110, showShadow = true }: Props) {
  // Hooks must be called unconditionally before any early return
  const colors = useMemo(() => pickColors(product), [product.id, product.name, product.category, product.brand])
  const template = useMemo(() => pickTemplate(product), [product.id, product.category, product.container_type, product.name])

  if (product.image_url && product.image_source !== 'pending') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <img
          src={product.image_url}
          alt={product.name}
          width={size}
          height={size}
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: showShadow ? 'drop-shadow(-1px 2px 4px rgba(0,0,0,0.35))' : 'none',
          }}
        />
      </div>
    )
  }

  const words = product.name.split(' ')
  const labelA = product.brand?.split(' ')[0] ?? words[0] ?? 'Aria'
  const labelB = words.slice(product.brand ? 0 : 1, product.brand ? 2 : 3).join(' ')

  const svgProps = { colors, labelA, labelB, size, pid: product.id }

  let visual: React.ReactNode
  switch (template) {
    case 'beer-stubby':   visual = <BottleSvg {...svgProps} neck={27}/>; break
    case 'wine-bordeaux': visual = <WineSvg   {...svgProps}/>; break
    case 'wine-burgundy': visual = <WineSvg   {...svgProps}/>; break
    case 'spirit-wide':   visual = <SpiritSvg {...svgProps}/>; break
    case 'can-355':       visual = <CanSvg    {...svgProps}/>; break
    case 'can-440':       visual = <CanSvg    {...svgProps}/>; break
    case 'generic':       visual = <GenericBlock colors={colors} label={labelA} size={size}/>; break
    default:              visual = <BottleSvg {...svgProps} neck={25}/>
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
      {visual}
      {showShadow && (
        <div style={{
          position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)',
          width: '60%', height: 6, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(0,0,0,0.45) 0%, transparent 70%)',
          filter: 'blur(4px)', pointerEvents: 'none',
        }}/>
      )}
    </div>
  )
}
