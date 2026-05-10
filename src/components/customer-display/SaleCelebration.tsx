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
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 220, height: 180 }}>
      {/* Left hand grips */}
      <div style={{
        position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
        fontSize: 52, lineHeight: 1, zIndex: 3,
        opacity: 0,
        animation: 'hand-grip-left 700ms cubic-bezier(0.16, 1, 0.3, 1) 200ms forwards',
        transformOrigin: 'right center',
      }}>🤚</div>

      {/* Can in center */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <svg width="64" height="118" viewBox="0 0 60 110" style={{ display: 'block' }}>
          <ellipse cx="30" cy="9" rx="16" ry="3" fill="var(--violet-700)"/>
          {/* Tab */}
          <g style={{
            animation: 'can-tab-pull 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 1050ms both',
            transformOrigin: '30px 9px',
          }}>
            <rect x="26" y="3" width="8" height="8" rx="2" fill="var(--violet-600, #5A9577)"/>
          </g>
          <rect x="14" y="9" width="32" height="96" fill="var(--violet)" rx="3"/>
          <ellipse cx="30" cy="105" rx="16" ry="3" fill="var(--violet-700)"/>
          <rect x="16" y="36" width="28" height="42" fill="white" opacity="0.92" rx="2"/>
          <text x="30" y="56" fontFamily="Georgia" fontSize="9" fill="var(--violet-700)"
                textAnchor="middle" fontStyle="italic" fontWeight="bold">Aria</text>
          <text x="30" y="67" fontFamily="Georgia" fontSize="3.5" fill="var(--violet-700)"
                textAnchor="middle">AU BREW</text>
          <ellipse cx="20" cy="62" rx="1.5" ry="14" fill="white" opacity="0.35"/>
        </svg>
        {/* Foam particles burst after tab pull */}
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            position: 'absolute',
            top: -6,
            left: `${14 + i * 9}px`,
            width: i % 2 === 0 ? 7 : 5,
            height: i % 2 === 0 ? 7 : 5,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.88)',
            animation: `foam-rise 900ms ease-out ${1150 + i * 70}ms both`,
          }} />
        ))}
      </div>

      {/* Right hand pulls tab (mirrored) */}
      <div style={{
        position: 'absolute', right: 8, top: '42%', transform: 'translateY(-50%)',
        fontSize: 52, lineHeight: 1, zIndex: 3,
        opacity: 0,
        animation: 'hand-grip-right-pull 1500ms cubic-bezier(0.16, 1, 0.3, 1) 200ms forwards',
        transformOrigin: 'left center',
      }}>🤚</div>
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
  // 5 steam streams at staggered horizontal positions above the cup
  const steamCols = [38, 46, 50, 54, 62] // % from left
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: 130, height: 170 }}>
        {/* Steam streams — positioned above cup via bottom: 60% */}
        {steamCols.map((left, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${left}%`,
            bottom: '60%',
            transform: 'translateX(-50%)',
            width: 5,
            height: 52,
            background: 'linear-gradient(to top, rgba(200,210,220,0.65), transparent)',
            borderRadius: 10,
            zIndex: 3,
            animation: `steam-rise 2.2s ease-in-out ${i * 0.4}s infinite`,
            transformOrigin: 'bottom center',
          }} />
        ))}

        {/* Cup — centered, rendered after steam in DOM so z-index is above */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 96,
          lineHeight: 1,
          zIndex: 2,
          opacity: 0,
          animation: 'fade-up 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}>☕</div>
      </div>
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
