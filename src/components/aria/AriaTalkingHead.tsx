'use client'
import { Suspense, useEffect, useRef, useState, Component } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// ─── Error boundary ───────────────────────────────────────────────────────────
class AvatarErrorBoundary extends Component<{children: ReactNode},{error: boolean}> {
  constructor(props: {children: ReactNode}) { super(props); this.state = { error: false } }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return <AriaMonogram isActive={false} />
    return this.props.children
  }
}

// ─── Fallback monogram ────────────────────────────────────────────────────────
function AriaMonogram({ isActive }: { isActive: boolean }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(127,184,151,0.12)', border: '1.5px solid rgba(127,184,151,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', color: '#7FB897', fontSize: 24 }}>A</span>
      </div>
      {isActive && (
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 10 }}>
          {[5,9,7,8].map((h,i) => <div key={i} style={{ width: 2, height: h, borderRadius: 2, background: '#7FB897', animation: `ariaB${i} 0.5s ease-in-out infinite alternate`, animationDelay: `${i*0.12}s` }} />)}
        </div>
      )}
      <style>{`@keyframes ariaB0{from{height:4px}to{height:8px}}@keyframes ariaB1{from{height:9px}to{height:3px}}@keyframes ariaB2{from{height:5px}to{height:9px}}@keyframes ariaB3{from{height:7px}to{height:4px}}`}</style>
    </div>
  )
}

// Animations GLB from IAcine repo (Idle, Talking_1, Talking_2, etc.)
const ANIM_GLB = 'https://raw.githubusercontent.com/Yacine-Mekideche/IAcine-Virtual-Avatar/main/front/public/models/animations.glb'

// ─── Avatar mesh — renders whatever GLB is in your Blob store ────────────────
function AvatarMesh({ isActive, avatarUrl }: { isActive: boolean; avatarUrl: string }) {
  const group = useRef<THREE.Group>(null!)

  // Load your custom Blob GLB
  const { scene } = useGLTF(avatarUrl)
  // Load animations from IAcine repo
  const { animations } = useGLTF(ANIM_GLB)
  const { actions, mixer } = useAnimations(animations, group)

  const prevAnim = useRef('Idle')

  useEffect(() => {
    if (!actions) return
    const animName = isActive ? 'Talking_1' : 'Idle'
    const next = actions[animName]
    const prev = actions[prevAnim.current]
    if (!next) return
    next.reset().fadeIn(prevAnim.current === animName ? 0 : 0.5).play()
    if (prev && prevAnim.current !== animName) prev.fadeOut(0.5)
    prevAnim.current = animName
  }, [isActive, actions])

  // Blink via morph targets (works if avatar has ARKit blend shapes)
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const next = () => {
      t = setTimeout(() => {
        setBlink(true)
        setTimeout(() => { setBlink(false); next() }, 150)
      }, Math.random() * 4000 + 1500)
    }
    next()
    return () => clearTimeout(t)
  }, [])

  useFrame(() => {
    scene.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh
      if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return
      const lerpMorph = (name: string, target: number) => {
        const idx = mesh.morphTargetDictionary![name]
        if (idx === undefined) return
        mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(
          mesh.morphTargetInfluences![idx], target, 0.5
        )
      }
      lerpMorph('eyeBlinkLeft',  blink ? 1 : 0)
      lerpMorph('eyeBlinkRight', blink ? 1 : 0)
    })
  })

  // Frustum culling off (prevents meshes disappearing at edges)
  useEffect(() => {
    scene.traverse(obj => { obj.frustumCulled = false })
  }, [scene])

  return (
    <group ref={group} dispose={null}>
      <primitive object={scene} />
    </group>
  )
}

// Preload animations
useGLTF.preload(ANIM_GLB)
useGLTF.setDecoderPath('https://unpkg.com/three@0.167.0/examples/jsm/libs/draco/')

// ─── Public component ─────────────────────────────────────────────────────────
interface Props { isActive: boolean; responseText: string }

function Inner({ isActive }: Props) {
  // Fetch the avatar URL from our proxy (serves Blob GLB or brunette fallback)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    // Use the proxy route — it serves your Blob GLB server-side (no CORS)
    setAvatarUrl('/api/aria/avatar')
  }, [])

  if (!avatarUrl) return null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows
        camera={{ position: [0, 1.5, 3], fov: 30 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1} castShadow />

        <Suspense fallback={null}>
          <AvatarMesh isActive={isActive} avatarUrl={avatarUrl} />
        </Suspense>
      </Canvas>

      {isActive && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, alignItems: 'flex-end', height: 12, pointerEvents: 'none' }}>
          {[5,9,7,8].map((h,i) => (
            <div key={i} style={{ width: 2, borderRadius: 2, background: '#7FB897', height: h, animation: `ariaB${i} 0.5s ease-in-out infinite alternate`, animationDelay: `${i*0.12}s` }} />
          ))}
        </div>
      )}
      <style>{`
        @keyframes ariaB0{from{height:4px}to{height:8px}}
        @keyframes ariaB1{from{height:9px}to{height:3px}}
        @keyframes ariaB2{from{height:5px}to{height:9px}}
        @keyframes ariaB3{from{height:7px}to{height:4px}}
      `}</style>
    </div>
  )
}

export function AriaTalkingHead(props: Props) {
  return (
    <AvatarErrorBoundary>
      <Inner {...props} />
    </AvatarErrorBoundary>
  )
}
