'use client'
import { Suspense, useEffect, useRef, useState, Component } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame, useGraph } from '@react-three/fiber'
import { useAnimations, useFBX, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { SkinnedMesh } from 'three'

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

// ─── ARKit blend shape → viseme mapping (Rhubarb phonemes) ───────────────────
const VISEME_MAP: Record<string, string> = {
  A: 'viseme_PP', B: 'viseme_kk', C: 'viseme_I',
  D: 'viseme_AA', E: 'viseme_O',  F: 'viseme_U',
  G: 'viseme_FF', H: 'viseme_TH', X: 'viseme_PP',
}

// ─── GLB URLs (RPM avatar + animations from IAcine-Virtual-Avatar repo) ───────
const AVATAR_GLB = 'https://raw.githubusercontent.com/Yacine-Mekideche/IAcine-Virtual-Avatar/main/front/public/models/test4.glb'
const ANIM_GLB   = 'https://raw.githubusercontent.com/Yacine-Mekideche/IAcine-Virtual-Avatar/main/front/public/models/animations.glb'

// ─── Avatar mesh component ────────────────────────────────────────────────────
interface AvatarMeshProps { isActive: boolean }

function AvatarMesh({ isActive }: AvatarMeshProps) {
  const group = useRef<THREE.Group>(null!)
  const { scene } = useGLTF(AVATAR_GLB)
  const { animations } = useGLTF(ANIM_GLB)
  const { actions } = useAnimations(animations, group)

  // Clone scene so we can use it independently
  const { nodes, materials } = useGraph(scene)

  // Pick animation based on isActive
  const animName = isActive ? 'Talking_1' : 'Idle'
  const prevAnim = useRef<string>('Idle')

  useEffect(() => {
    if (!actions) return
    const next = actions[animName]
    const prev = actions[prevAnim.current]
    if (!next) return
    next.reset().fadeIn(prevAnim.current === animName ? 0 : 0.5).play()
    if (prev && prevAnim.current !== animName) prev.fadeOut(0.5)
    prevAnim.current = animName
  }, [isActive, actions, animName])

  // Blink
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

  // Lerp morph targets smoothly
  const lerpMorph = (target: string, value: number, speed = 0.1) => {
    scene.traverse((child) => {
      const mesh = child as SkinnedMesh
      if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary) return
      const idx = mesh.morphTargetDictionary[target]
      if (idx === undefined || !mesh.morphTargetInfluences) return
      mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(
        mesh.morphTargetInfluences[idx], value, speed
      )
    })
  }

  useFrame(() => {
    lerpMorph('eyeBlinkLeft',  blink ? 1 : 0, 0.5)
    lerpMorph('eyeBlinkRight', blink ? 1 : 0, 0.5)
  })

  // Cast nodes to typed meshes
  const n = nodes as Record<string, THREE.SkinnedMesh & { skeleton: THREE.Skeleton }>
  const m = materials as Record<string, THREE.Material>

  return (
    <group ref={group} dispose={null}>
      <primitive object={n.Hips} />
      <skinnedMesh geometry={n.Wolf3D_Body.geometry}           material={m.Wolf3D_Body}           skeleton={n.Wolf3D_Body.skeleton} />
      <skinnedMesh geometry={n.Wolf3D_Outfit_Bottom.geometry}  material={m.Wolf3D_Outfit_Bottom}  skeleton={n.Wolf3D_Outfit_Bottom.skeleton} />
      <skinnedMesh geometry={n.Wolf3D_Outfit_Footwear.geometry} material={m.Wolf3D_Outfit_Footwear} skeleton={n.Wolf3D_Outfit_Footwear.skeleton} />
      <skinnedMesh geometry={n.Wolf3D_Outfit_Top.geometry}     material={m.Wolf3D_Outfit_Top}     skeleton={n.Wolf3D_Outfit_Top.skeleton} />
      <skinnedMesh geometry={n.Wolf3D_Hair.geometry}           material={m.Wolf3D_Hair}           skeleton={n.Wolf3D_Hair.skeleton} />
      <skinnedMesh
        geometry={n.EyeLeft.geometry} material={m.Wolf3D_Eye}
        skeleton={n.EyeLeft.skeleton}
        morphTargetDictionary={n.EyeLeft.morphTargetDictionary}
        morphTargetInfluences={n.EyeLeft.morphTargetInfluences}
      />
      <skinnedMesh
        geometry={n.EyeRight.geometry} material={m.Wolf3D_Eye}
        skeleton={n.EyeRight.skeleton}
        morphTargetDictionary={n.EyeRight.morphTargetDictionary}
        morphTargetInfluences={n.EyeRight.morphTargetInfluences}
      />
      <skinnedMesh
        geometry={n.Wolf3D_Head.geometry} material={m.Wolf3D_Skin}
        skeleton={n.Wolf3D_Head.skeleton}
        morphTargetDictionary={n.Wolf3D_Head.morphTargetDictionary}
        morphTargetInfluences={n.Wolf3D_Head.morphTargetInfluences}
      />
      <skinnedMesh
        geometry={n.Wolf3D_Teeth.geometry} material={m.Wolf3D_Teeth}
        skeleton={n.Wolf3D_Teeth.skeleton}
        morphTargetDictionary={n.Wolf3D_Teeth.morphTargetDictionary}
        morphTargetInfluences={n.Wolf3D_Teeth.morphTargetInfluences}
      />
    </group>
  )
}

// Preload both GLBs
// Use unpkg for Draco decoder (already in CSP connect-src + script-src)
useGLTF.setDecoderPath('https://unpkg.com/three@0.167.0/examples/jsm/libs/draco/')
useGLTF.preload(AVATAR_GLB)
useGLTF.preload(ANIM_GLB)

// ─── Public props ─────────────────────────────────────────────────────────────
interface Props { isActive: boolean; responseText: string }

function Inner({ isActive }: Props) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows
        camera={{ position: [0, 0, 1], fov: 30 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1} castShadow />

        <Suspense fallback={null}>
          <AvatarMesh isActive={isActive} />
        </Suspense>
      </Canvas>

      {/* Aria speaking indicator */}
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
