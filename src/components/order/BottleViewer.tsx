'use client'
import React, { Suspense, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { BottleSlug } from '@/lib/bottleSlug'

export type { BottleSlug }

export interface BottleViewerProps {
  slug: BottleSlug
  label?: string       // product name — typographic fallback
  labelUrl?: string    // uploaded label art — NEVER AI-generated (trademark risk)
  size?: number        // container side px (default 320)
}

// ClampToEdgeWrapping = 1001 (THREE constant, inlined to avoid top-level import)
const CLAMP = 1001
const DAMPING = 0.86   // velocity multiplier per frame at 60 fps
const SENS   = 0.007   // radians per pixel dragged

// ── Label overlay (HTML, no R3F dependency) ───────────────────────────────
function LabelOverlay({ label, labelUrl, size }: { label?: string; labelUrl?: string; size: number }) {
  if (!label && !labelUrl) return null
  const bottom = Math.floor(size * 0.12)
  const maxW   = Math.floor(size * 0.68)
  const maxH   = Math.floor(size * 0.26)
  const fs     = Math.floor(size * 0.041)
  return (
    <div
      style={{
        position: 'absolute',
        bottom: bottom,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 10,
        maxWidth: maxW,
      }}
    >
      {labelUrl ? (
        <img
          src={labelUrl}
          alt={label ?? ''}
          style={{
            maxWidth: '100%',
            maxHeight: maxH,
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          }}
        />
      ) : (
        <div
          style={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 20,
            padding: '4px 14px',
            fontSize: fs,
            fontWeight: 600,
            color: '#1a1a1a',
            fontFamily: "'Inter', system-ui, sans-serif",
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  )
}

// ── R3F scene — dynamic (no SSR) ─────────────────────────────────────────
const BottleViewer3D = dynamic<BottleViewerProps>(
  () =>
    Promise.all([
      import('@react-three/fiber'),
      import('@react-three/drei'),
      import('three'),
    ]).then(([{ Canvas, useFrame }, { useGLTF }, THREE]) => {

      function clampTextures(scene: any) {
        scene.traverse((obj: any) => {
          if (!obj.isMesh) return
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m: any) => {
            if (!m) return
            ;['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach(k => {
              const t = m[k]
              if (t && t.isTexture) { t.wrapS = CLAMP; t.wrapT = CLAMP; t.needsUpdate = true }
            })
          })
        })
      }

      // Preload all 5 canonical bottles
      ;(['wine', 'beer', 'can', 'spirits-a', 'spirits-b'] as BottleSlug[]).forEach(s => {
        useGLTF.preload('/menu/_lib/models/' + s + '.glb')
      })

      function NormalizedModel({ slug }: { slug: BottleSlug }) {
        const url = '/menu/_lib/models/' + slug + '.glb'
        const gltf = useGLTF(url) as any
        const scene = gltf.scene as any

        if (!scene.__bottleNorm) {
          scene.__bottleNorm = true
          clampTextures(scene)
          scene.updateMatrixWorld(true)
          const box = new THREE.Box3().setFromObject(scene)
          const sz = new THREE.Vector3()
          box.getSize(sz)
          if (sz.y > 0.01) {
            const s = 2.0 / sz.y
            scene.scale.setScalar(s)
            scene.updateMatrixWorld(true)
            const box2 = new THREE.Box3().setFromObject(scene)
            const ctr = new THREE.Vector3()
            box2.getCenter(ctr)
            scene.position.sub(ctr)
          }
        }

        return <primitive object={scene} />
      }

      function Scene({
        slug, rotRef, velRef, isDraggingRef,
      }: {
        slug: BottleSlug
        rotRef: { current: number }
        velRef: { current: number }
        isDraggingRef: { current: boolean }
      }) {
        const groupRef = useRef<any>(null)

        useFrame((_, delta) => {
          const g = groupRef.current
          if (!g) return
          if (!isDraggingRef.current) {
            if (Math.abs(velRef.current) > 0.0006) {
              velRef.current *= Math.pow(DAMPING, delta * 60)
              rotRef.current  -= velRef.current
            } else {
              velRef.current = 0
            }
          }
          g.rotation.y = rotRef.current
        })

        return (
          <>
            <ambientLight intensity={0.72} />
            <directionalLight position={[4, 8, 4]} intensity={1.5} />
            <directionalLight position={[-3, 3, -2]} intensity={0.42} color="#cce0ff" />
            <pointLight position={[0, -2, 3]} intensity={0.28} />
            <Suspense fallback={null}>
              <group ref={groupRef}>
                <NormalizedModel slug={slug} />
              </group>
            </Suspense>
          </>
        )
      }

      function BottleCanvas({ slug, label, labelUrl, size = 320 }: BottleViewerProps) {
        const rotRef       = useRef(0)
        const velRef       = useRef(0)
        const isDraggingRef = useRef(false)
        const lastXRef     = useRef(0)
        const [hintVisible, setHintVisible] = useState(true)

        const shadowW = Math.floor(size * 0.36)
        const shadowH = Math.floor(size * 0.05)
        const shadowB = Math.floor(size * 0.07)

        return (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              cursor: 'grab',
              userSelect: 'none',
            }}
            onPointerDown={(e) => {
              isDraggingRef.current = true
              lastXRef.current = e.clientX
              velRef.current = 0
              e.currentTarget.setPointerCapture(e.pointerId)
              if (hintVisible) setHintVisible(false)
            }}
            onPointerMove={(e) => {
              if (!isDraggingRef.current) return
              const dx = e.clientX - lastXRef.current
              velRef.current   = dx * SENS
              rotRef.current  -= dx * SENS
              lastXRef.current = e.clientX
            }}
            onPointerUp={() => { isDraggingRef.current = false }}
            onPointerLeave={() => { isDraggingRef.current = false }}
          >
            {/* Contact shadow / pedestal */}
            <div
              style={{
                position: 'absolute',
                bottom: shadowB,
                left: '50%',
                transform: 'translateX(-50%)',
                width: shadowW,
                height: shadowH,
                borderRadius: '50%',
                background: 'radial-gradient(ellipse, rgba(0,0,0,0.13) 0%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />

            <Canvas
              camera={{ position: [0, 0.3, 3.8], fov: 40 }}
              style={{ width: '100%', height: '100%' }}
              gl={{ alpha: true, antialias: true }}
            >
              <Scene
                slug={slug}
                rotRef={rotRef}
                velRef={velRef}
                isDraggingRef={isDraggingRef}
              />
            </Canvas>

            <LabelOverlay label={label} labelUrl={labelUrl} size={size} />

            {hintVisible && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.42)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.03em',
                  padding: '4px 10px',
                  borderRadius: 20,
                  pointerEvents: 'none',
                  fontFamily: "'Inter', system-ui, sans-serif",
                  whiteSpace: 'nowrap',
                  zIndex: 20,
                }}
              >
                360° drag
              </div>
            )}
          </div>
        )
      }

      return { default: BottleCanvas }
    }),
  { ssr: false, loading: () => null },
)

// ── Public component ──────────────────────────────────────────────────────
export function BottleViewer(props: BottleViewerProps) {
  const s = props.size ?? 320
  return (
    <div
      style={{
        width: s,
        height: s,
        borderRadius: 24,
        background: '#fafafa',
        boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <BottleViewer3D {...props} />
    </div>
  )
}