'use client'
import { Suspense, useEffect, useRef, useState, Component } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

class AvatarErrorBoundary extends Component<{children: ReactNode},{error: boolean}> {
  constructor(props: {children: ReactNode}) { super(props); this.state = { error: false } }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return <AriaMonogram isActive={false} />
    return this.props.children
  }
}

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

const ARIA_GLB = '/models/Aria.glb'
const ANIM_GLB = 'https://raw.githubusercontent.com/Yacine-Mekideche/IAcine-Virtual-Avatar/main/front/public/models/animations.glb'

const VROID_BLINK_L = 'Fcl_EYE_Close_L'
const VROID_BLINK_R = 'Fcl_EYE_Close_R'
const VROID_BLINK   = 'Fcl_EYE_Close'

const MOOD_MORPHS: Record<string, Record<string, number>> = {
  happy:   { Fcl_ALL_Joy: 0.5 },
  neutral: { Fcl_ALL_Neutral: 0.2 },
}

function AvatarMesh({ isActive }: { isActive: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const { scene } = useGLTF(ARIA_GLB)
  const { animations } = useGLTF(ANIM_GLB)
  const { actions } = useAnimations(animations, group)
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

  useEffect(() => {
    scene.traverse(obj => { obj.frustumCulled = false })
  }, [scene])

  const blinkTarget = useRef(0)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const next = () => {
      t = setTimeout(() => {
        blinkTarget.current = 1
        setTimeout(() => { blinkTarget.current = 0; next() }, 150)
      }, Math.random() * 4000 + 1500)
    }
    next()
    return () => clearTimeout(t)
  }, [])

  const lerpMorph = (mesh: THREE.SkinnedMesh, name: string, target: number, speed = 0.15) => {
    const dict = mesh.morphTargetDictionary
    const infl = mesh.morphTargetInfluences
    if (!dict || !infl) return
    const idx = dict[name]
    if (idx === undefined) return
    infl[idx] = THREE.MathUtils.lerp(infl[idx], target, speed)
  }

  useFrame(() => {
    scene.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh
      if (!mesh.isSkinnedMesh) return
      lerpMorph(mesh, VROID_BLINK,   blinkTarget.current, 0.5)
      lerpMorph(mesh, VROID_BLINK_L, blinkTarget.current, 0.5)
      lerpMorph(mesh, VROID_BLINK_R, blinkTarget.current, 0.5)
      const mood = isActive ? MOOD_MORPHS.happy : MOOD_MORPHS.neutral
      for (const [k, v] of Object.entries(mood)) lerpMorph(mesh, k, v, 0.05)
      const inactive = isActive ? MOOD_MORPHS.neutral : MOOD_MORPHS.happy
      for (const k of Object.keys(inactive)) lerpMorph(mesh, k, 0, 0.05)
    })
  })

  return (
    <group ref={group} dispose={null}>
      {/* VRoid avatars are ~1.6m tall, origin at feet.
          Shift down so head+shoulders fill the upper frame.
          position-y=-1.35 puts the waist at camera center → upper body visible */}
      <primitive object={scene} position={[0, -1.35, 0]} />
    </group>
  )
}

useGLTF.preload(ARIA_GLB)
useGLTF.preload(ANIM_GLB)
useGLTF.setDecoderPath('https://unpkg.com/three@0.167.0/examples/jsm/libs/draco/')

interface Props { isActive: boolean; responseText: string }

function Inner({ isActive }: Props) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
        camera={{
          // Camera at eye level, looking straight at the avatar's face
          // VRoid head is at ~1.55m, so look at y=1.4 from z=1.8
          position: [0, 0.2, 1.8],
          fov: 28,
          near: 0.1,
          far: 100,
        }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[2, 3, 3]} intensity={1.2} castShadow />
        <directionalLight position={[-2, 1, 1]} intensity={0.4} />

        <Suspense fallback={null}>
          <AvatarMesh isActive={isActive} />
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
