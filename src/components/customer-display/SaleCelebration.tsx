'use client'
import { useEffect, useState } from 'react'

type AnimationType = 'beer-can' | 'wine-bottle' | 'snacks-spill' | 'coffee-steam' | 'cake-cut' | 'generic'

interface Props {
  visible: boolean
  animationType: AnimationType
  customerName?: string
  total: number
  pointsEarned?: number
  onComplete?: () => void
}

function SageParticleBurst() {
  const particles = Array.from({ length: 12 }, (_, i) => i)
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map(i => (
        <div key={i} style={{
          position: 'absolute',
          left: `${20 + Math.random() * 60}%`,
          top: `${20 + Math.random() * 40}%`,
          width: 8 + (i % 4) * 4,
          height: 8 + (i % 4) * 4,
          borderRadius: i % 3 === 0 ? '50%' : '2px',
          background: i % 2 === 0 ? 'var(--violet)' : 'var(--success)',
          opacity: 0.6,
          animation: `fade-up ${0.8 + i * 0.1}s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.05}s forwards`,
        }} />
      ))}
    </div>
  )
}

function BeerCanAnim() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          opacity: 0,
          animation: `fade-up 600ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms forwards`,
          transform: `rotate(${(i - 1) * 8}deg)`,
        }}>
          <svg width="60" height="110" viewBox="0 0 60 110">
            <rect x="14" y="9" width="32" height="96" fill="var(--violet)" rx="4"/>
            <ellipse cx="30" cy="9" rx="16" ry="3" fill="var(--violet-700)"/>
            <ellipse cx="30" cy="105" rx="16" ry="3" fill="var(--violet-700)"/>
            <rect x="16" y="35" width="28" height="44" fill="white" opacity="0.9" rx="2"/>
            <text x="30" y="57" fontFamily="Georgia" fontSize="8" fill="var(--violet-700)"
                  textAnchor="middle" fontStyle="italic" fontWeight="bold">Aria</text>
            <text x="30" y="68" fontFamily="Georgia" fontSize="4" fill="var(--violet-700)"
                  textAnchor="middle">AU BREW</text>
          </svg>
        </div>
      ))}
    </div>
  )
}

function WineBottleAnim() {
  return (
    <div style={{ opacity: 0, animation: 'fade-up 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
      <svg width="80" height="200" viewBox="0 0 80 200">
        <rect x="35" y="0" width="10" height="22" fill="var(--violet-700)"/>
        <rect x="30" y="22" width="20" height="10" fill="var(--violet-700)"/>
        <path d="M30 32 L30 56 Q10 64 10 88 L10 192 Q10 200 20 200 L60 200 Q70 200 70 192 L70 88 Q70 64 50 56 L50 32 Z" fill="var(--violet)"/>
        <rect x="14" y="110" width="52" height="64" fill="white" opacity="0.95" rx="2"/>
        <text x="40" y="138" fontFamily="Georgia" fontSize="13" fill="var(--violet-700)"
              textAnchor="middle" fontStyle="italic" fontWeight="bold">Aria</text>
        <text x="40" y="152" fontFamily="Georgia" fontSize="5" fill="var(--violet-700)"
              textAnchor="middle">PREMIUM · 2024</text>
        <ellipse cx="18" cy="130" rx="2" ry="28" fill="white" opacity="0.35"/>
      </svg>
    </div>
  )
}

function SnacksSpillAnim() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
      {['🍪', '🍫', '🥤', '🍿'].map((emoji, i) => (
        <div key={i} style={{
          fontSize: 48,
          opacity: 0,
          animation: `fade-up 500ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 80}ms forwards`,
        }}>{emoji}</div>
      ))}
    </div>
  )
}

function CoffeeSteamAnim() {
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 4, height: 24, background: 'var(--text-tertiary)',
            borderRadius: 4, opacity: 0,
            animation: `fade-up 1.2s ease-in-out ${i * 200}ms infinite`,
          }} />
        ))}
      </div>
      <div style={{ fontSize: 72, opacity: 0, animation: 'fade-up 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>☕</div>
    </div>
  )
}

function CakeCutAnim() {
  return (
    <div style={{ fontSize: 80, opacity: 0, animation: 'fade-up 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}>
      🎂
    </div>
  )
}

function GenericCelebration() {
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 56 }}>
      {['✦', '✦', '✦'].map((s, i) => (
        <span key={i} style={{
          color: 'var(--violet)',
          opacity: 0,
          animation: `fade-up 500ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 100}ms forwards`,
        }}>{s}</span>
      ))}
    </div>
  )
}

export function SaleCelebration({ visible, animationType, customerName, total, pointsEarned, onComplete }: Props) {
  const [stage, setStage] = useState<'enter' | 'play' | 'thanks' | 'exit'>('enter')

  useEffect(() => {
    if (!visible) return
    setStage('enter')
    const t1 = setTimeout(() => setStage('play'), 100)
    const t2 = setTimeout(() => setStage('thanks'), 1800)
    const t3 = setTimeout(() => setStage('exit'), 4000)
    const t4 = setTimeout(() => onComplete?.(), 4500)
    return () => { [t1, t2, t3, t4].forEach(clearTimeout) }
  }, [visible, onComplete])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(180deg, var(--bg-base) 0%, var(--bg-canvas) 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: stage === 'exit' ? 0 : 1,
      transition: 'opacity 500ms ease-out',
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'var(--bg-aurora)' }} />

      <div style={{ position: 'relative', zIndex: 2 }}>
        {animationType === 'beer-can' && <BeerCanAnim />}
        {animationType === 'wine-bottle' && <WineBottleAnim />}
        {animationType === 'snacks-spill' && <SnacksSpillAnim />}
        {animationType === 'coffee-steam' && <CoffeeSteamAnim />}
        {animationType === 'cake-cut' && <CakeCutAnim />}
        {animationType === 'generic' && <GenericCelebration />}
      </div>

      {stage !== 'enter' && <SageParticleBurst />}

      {(stage === 'thanks' || stage === 'exit') && (
        <div style={{
          position: 'relative', zIndex: 2, marginTop: 32,
          textAlign: 'center',
          animation: 'fade-up 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}>
          <p className="font-display" style={{
            fontSize: 48, fontStyle: 'italic',
            color: 'var(--violet)', margin: 0, fontWeight: 500,
          }}>
            Thank you{customerName ? `, ${customerName}` : ''}
          </p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px', fontFamily: "'JetBrains Mono',monospace" }}>
            A${total.toFixed(2)}
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            {pointsEarned ? `+${pointsEarned} loyalty points` : 'Have a great day!'}
          </p>
        </div>
      )}
    </div>
  )
}
