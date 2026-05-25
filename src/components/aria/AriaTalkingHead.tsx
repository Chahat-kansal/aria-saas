'use client'
import { Suspense, useEffect, useRef, Component } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(127,184,151,0.12)', border: '1.5px solid rgba(127,184,151,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', color: '#7FB897', fontSize: 24 }}>A</span>
      </div>
      {isActive && (
        <div style={{ position: 'absolute', bottom: 8, display: 'flex', gap: 2, alignItems: 'flex-end', height: 10 }}>
          {[5,9,7,8].map((h,i) => <div key={i} style={{ width: 2, height: h, borderRadius: 2, background: '#7FB897', animation: `ariaB${i} 0.5s ease-in-out infinite alternate`, animationDelay: `${i*0.12}s` }} />)}
        </div>
      )}
      <style>{`@keyframes ariaB0{from{height:4px}to{height:8px}}@keyframes ariaB1{from{height:9px}to{height:3px}}@keyframes ariaB2{from{height:5px}to{height:9px}}@keyframes ariaB3{from{height:7px}to{height:4px}}`}</style>
    </div>
  )
}

const ARIA_GLB = '/models/Aria.glb'
const ANIM_GLB = 'https://raw.githubusercontent.com/Yacine-Mekideche/IAcine-Virtual-Avatar/main/front/public/models/animations.glb'

// Talking_0/1/2 all have natural upper body movement without crazy arm swings
const TALKING_ANIMS = ['Talking_0', 'Talking_1', 'Talking_2']

function CameraRig() {
  const { camera } = useThree()
  useEffect(() => {
    // Tight face+neck crop — keeps arms OUT of frame entirely
    camera.lookAt(0, 1.5, 0)
  }, [camera])
  return null
}

function AvatarMesh({ isActive }: { isActive: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const { scene } = useGLTF(ARIA_GLB)
  const { animations } = useGLTF(ANIM_GLB)
  const { actions } = useAnimations(animations, group)
  const currentAnim = useRef('Idle')
  const hasGreeted = useRef(false)
  const talkingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const playAnim = (name: string, fadeIn = 0.4) => {
    const next = actions[name]
    const prev = actions[currentAnim.current]
    if (!next || currentAnim.current === name) return
    next.reset().fadeIn(fadeIn).play()
    prev?.fadeOut(fadeIn)
    currentAnim.current = name
  }

  // Greeting on mount: Talking_0 (natural, no crazy arms) for 2s → Idle
  useEffect(() => {
    if (hasGreeted.current || !actions['Talking_0'] || !actions['Idle']) return
    hasGreeted.current = true
    actions['Idle']!.reset().fadeIn(0).play()
    currentAnim.current = 'Idle'
    setTimeout(() => {
      playAnim('Talking_0', 0.4)
      setTimeout(() => playAnim('Idle', 0.6), 2200)
    }, 800)
  }, [actions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle talking anims when responding
  useEffect(() => {
    if (talkingTimeout.current) clearTimeout(talkingTimeout.current)
    if (isActive) {
      const pickTalking = () => {
        const anim = TALKING_ANIMS[Math.floor(Math.random() * TALKING_ANIMS.length)]
        playAnim(anim, 0.4)
        talkingTimeout.current = setTimeout(pickTalking, 3500 + Math.random() * 1500)
      }
      pickTalking()
    } else {
      playAnim('Idle', 0.5)
    }
    return () => { if (talkingTimeout.current) clearTimeout(talkingTimeout.current) }
  }, [isActive, actions]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scene.traverse(o => { o.frustumCulled = false })
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

  useFrame(() => {
    scene.traverse(child => {
      const m = child as THREE.SkinnedMesh
      if (!m.isSkinnedMesh || !m.morphTargetDictionary || !m.morphTargetInfluences) return
      const lerp = (name: string, target: number, speed = 0.15) => {
        const idx = m.morphTargetDictionary![name]
        if (idx === undefined) return
        m.morphTargetInfluences![idx] = THREE.MathUtils.lerp(m.morphTargetInfluences![idx], target, speed)
      }
      lerp('Fcl_EYE_Close',   blinkTarget.current, 0.5)
      lerp('Fcl_EYE_Close_L', blinkTarget.current, 0.5)
      lerp('Fcl_EYE_Close_R', blinkTarget.current, 0.5)
      lerp('Fcl_ALL_Joy',     isActive ? 0.5 : 0,   0.05)
      lerp('Fcl_ALL_Neutral', isActive ? 0 : 0.2,   0.05)
    })
  })

  return (
    <group ref={group} dispose={null}>
      <primitive object={scene} />
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
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
        camera={{
          // Tight head crop — zoomed in so arms are completely out of frame
          position: [0, 1.52, 1.1],
          fov: 18,
          near: 0.01,
          far: 100,
        }}
      >
        <CameraRig />
        <ambientLight intensity={1.6} />
        <directionalLight position={[2, 4, 3]} intensity={1.2} />
        <directionalLight position={[-2, 2, 1]} intensity={0.5} />
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
  return <AvatarErrorBoundary><Inner {...props} /></AvatarErrorBoundary>
}
