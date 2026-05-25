'use client'
import { useEffect, useRef } from 'react'

interface AriaTalkingHeadProps {
  isActive: boolean
  responseText: string
}

export function AriaTalkingHead({ isActive }: AriaTalkingHeadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Animate the speaking bars via canvas for smoothest possible animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    let animId: number

    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      if (!isActive) { animId = requestAnimationFrame(draw); frame++; return }

      const bars = 4
      const bw = 3
      const gap = 4
      const totalW = bars * bw + (bars - 1) * gap
      const startX = (canvas!.width - totalW) / 2

      for (let i = 0; i < bars; i++) {
        const phase = frame * 0.18 + i * 0.7
        const h = 4 + Math.abs(Math.sin(phase)) * 12
        const x = startX + i * (bw + gap)
        const y = (canvas!.height - h) / 2
        ctx!.fillStyle = '#7FB897'
        ctx!.beginPath()
        ctx!.roundRect(x, y, bw, h, 2)
        ctx!.fill()
      }
      frame++
      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [isActive])

  const G = '#7FB897'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

      {/* Animated SVG character — Aria */}
      <svg
        viewBox="0 0 120 160"
        style={{
          width: '100%',
          height: '100%',
          overflow: 'visible',
          filter: 'drop-shadow(0 0 12px rgba(127,184,151,0.15))',
        }}
      >
        <defs>
          {/* Radial mask — dissolves edges into dark bg */}
          <radialGradient id="ariaMask" cx="50%" cy="45%" r="48%">
            <stop offset="30%" stopColor="white" stopOpacity="1"/>
            <stop offset="100%" stopColor="white" stopOpacity="0"/>
          </radialGradient>
          <mask id="ariaFade">
            <rect x="0" y="0" width="120" height="160" fill="url(#ariaMask)"/>
          </mask>

          {/* Skin tone */}
          <radialGradient id="skinGrad" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#FDDCB5"/>
            <stop offset="100%" stopColor="#F0C090"/>
          </radialGradient>

          {/* Hair */}
          <radialGradient id="hairGrad" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="#3D2B1F"/>
            <stop offset="100%" stopColor="#1A120B"/>
          </radialGradient>

          {/* Outfit */}
          <linearGradient id="outfitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2D5240"/>
            <stop offset="100%" stopColor="#1A3328"/>
          </linearGradient>

          {/* Speaking mouth keyframes */}
          <style>{`
            @keyframes ariaIdle {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-1.5px); }
            }
            @keyframes ariaSpeak {
              0%, 100% { transform: translateY(0px) scale(1); }
              25% { transform: translateY(-1px) scale(1.005); }
              75% { transform: translateY(1px) scale(0.998); }
            }
            @keyframes ariaEyeBlink {
              0%, 90%, 100% { transform: scaleY(1); }
              95% { transform: scaleY(0.1); }
            }
            @keyframes ariaMouthOpen {
              0%, 100% { d: path('M 47 92 Q 60 94 73 92'); }
              50% { d: path('M 47 92 Q 60 98 73 92'); }
            }
            .aria-head-group {
              animation: ${isActive ? 'ariaSpeak 0.45s ease-in-out infinite' : 'ariaIdle 3s ease-in-out infinite'};
              transform-origin: 60px 80px;
            }
            .aria-left-eye { animation: ariaEyeBlink 4s ease-in-out infinite; transform-origin: 47px 78px; }
            .aria-right-eye { animation: ariaEyeBlink 4s ease-in-out infinite 0.1s; transform-origin: 73px 78px; }
          `}</style>
        </defs>

        <g mask="url(#ariaFade)">

          {/* Body / outfit */}
          <ellipse cx="60" cy="148" rx="34" ry="20" fill="url(#outfitGrad)" opacity="0.9"/>
          <rect x="28" y="118" width="64" height="35" rx="8" fill="url(#outfitGrad)"/>
          {/* Collar */}
          <path d="M 48 118 L 60 130 L 72 118" fill="none" stroke={G} strokeWidth="1.5" opacity="0.7"/>
          {/* Shoulders */}
          <ellipse cx="25" cy="122" rx="10" ry="8" fill="url(#outfitGrad)"/>
          <ellipse cx="95" cy="122" rx="10" ry="8" fill="url(#outfitGrad)"/>

          {/* Neck */}
          <rect x="54" y="107" width="12" height="14" rx="4" fill="url(#skinGrad)"/>

          {/* Head group — animates as one */}
          <g className="aria-head-group">
            {/* Hair back */}
            <ellipse cx="60" cy="72" rx="32" ry="34" fill="url(#hairGrad)"/>
            {/* Hair sides */}
            <path d="M 30 68 Q 22 85 26 105 Q 32 115 38 112 Q 34 98 36 80 Z" fill="url(#hairGrad)"/>
            <path d="M 90 68 Q 98 85 94 105 Q 88 115 82 112 Q 86 98 84 80 Z" fill="url(#hairGrad)"/>

            {/* Face */}
            <ellipse cx="60" cy="78" rx="26" ry="28" fill="url(#skinGrad)"/>

            {/* Eyebrows */}
            <path d="M 43 68 Q 47 65 51 67" stroke="#3D2B1F" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            <path d="M 69 67 Q 73 65 77 68" stroke="#3D2B1F" strokeWidth="1.8" strokeLinecap="round" fill="none"/>

            {/* Eyes */}
            <g className="aria-left-eye">
              <ellipse cx="47" cy="78" rx="5.5" ry="5.5" fill="white"/>
              <ellipse cx="47" cy="79" rx="3.5" ry="3.5" fill="#3B2D6E"/>
              <ellipse cx="47" cy="79" rx="2" ry="2" fill="#1A0F3C"/>
              <ellipse cx="48.5" cy="77.5" rx="1" ry="1" fill="white"/>
            </g>
            <g className="aria-right-eye">
              <ellipse cx="73" cy="78" rx="5.5" ry="5.5" fill="white"/>
              <ellipse cx="73" cy="79" rx="3.5" ry="3.5" fill="#3B2D6E"/>
              <ellipse cx="73" cy="79" rx="2" ry="2" fill="#1A0F3C"/>
              <ellipse cx="74.5" cy="77.5" rx="1" ry="1" fill="white"/>
            </g>
            {/* Eyelashes top */}
            <path d="M 42 74 Q 47 71 52 74" stroke="#1A0F3C" strokeWidth="1" fill="none" strokeLinecap="round"/>
            <path d="M 68 74 Q 73 71 78 74" stroke="#1A0F3C" strokeWidth="1" fill="none" strokeLinecap="round"/>

            {/* Nose */}
            <path d="M 59 84 Q 57 89 60 90 Q 63 89 61 84" stroke="#D4A574" strokeWidth="1" fill="none" strokeLinecap="round"/>

            {/* Mouth — open/close when speaking */}
            {isActive ? (
              <g>
                <path d="M 50 95 Q 60 102 70 95" stroke="#C0826A" strokeWidth="1.5" fill="#C0826A" strokeLinecap="round"/>
                <ellipse cx="60" cy="97" rx="7" ry="3" fill="#8B3A3A"/>
                <path d="M 50 95 Q 60 95 70 95" stroke="none" fill="#C0826A"/>
              </g>
            ) : (
              <path d="M 50 95 Q 60 99 70 95" stroke="#C0826A" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            )}

            {/* Cheek blush */}
            <ellipse cx="40" cy="86" rx="6" ry="4" fill="#FFB4A2" opacity="0.3"/>
            <ellipse cx="80" cy="86" rx="6" ry="4" fill="#FFB4A2" opacity="0.3"/>

            {/* Hair front / fringe */}
            <path d="M 34 68 Q 38 52 48 50 Q 55 48 60 50 Q 65 48 72 50 Q 82 52 86 68 Q 76 58 60 57 Q 44 58 34 68 Z" fill="url(#hairGrad)"/>
            {/* Hair detail strands */}
            <path d="M 46 57 Q 44 65 42 72" stroke="#1A120B" strokeWidth="1.2" fill="none" opacity="0.5"/>
            <path d="M 60 50 Q 60 62 59 70" stroke="#1A120B" strokeWidth="1.2" fill="none" opacity="0.5"/>
            <path d="M 74 57 Q 76 65 78 72" stroke="#1A120B" strokeWidth="1.2" fill="none" opacity="0.5"/>

            {/* Aria monogram on collar */}
            <text x="60" y="125" textAnchor="middle" fill={G} fontSize="8" fontStyle="italic" fontFamily="Georgia,serif" opacity="0.8">A</text>
          </g>

          {/* Green status dot */}
          <circle cx="88" cy="44" r="4" fill={G} opacity={isActive ? "1" : "0.5"}>
            {isActive && <animate attributeName="r" values="4;6;4" dur="1s" repeatCount="indefinite"/>}
            {isActive && <animate attributeName="opacity" values="1;0.5;1" dur="1s" repeatCount="indefinite"/>}
          </circle>

        </g>
      </svg>

      {/* Speaking bars at bottom */}
      <canvas
        ref={canvasRef}
        width={40}
        height={20}
        style={{
          position: 'absolute',
          bottom: 2,
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: isActive ? 1 : 0,
          transition: 'opacity 0.3s',
        }}
      />
    </div>
  )
}
