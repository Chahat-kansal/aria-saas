'use client'
import { useEffect, useRef, useState, Component } from 'react'
import type { ReactNode } from 'react'

class AvatarErrorBoundary extends Component<{children: ReactNode}, {error: boolean}> {
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

const VROID_TO_MIXAMO: Record<string, string> = {
  'J_Bip_C_Hips': 'Hips', 'J_Bip_C_Spine': 'Spine', 'J_Bip_C_Chest': 'Spine1',
  'J_Bip_C_UpperChest': 'Spine2', 'J_Bip_C_Neck': 'Neck', 'J_Bip_C_Head': 'Head',
  'J_Bip_L_Shoulder': 'LeftShoulder', 'J_Bip_L_UpperArm': 'LeftArm',
  'J_Bip_L_LowerArm': 'LeftForeArm', 'J_Bip_L_Hand': 'LeftHand',
  'J_Bip_L_Thumb1': 'LeftHandThumb1', 'J_Bip_L_Thumb2': 'LeftHandThumb2',
  'J_Bip_L_Thumb3': 'LeftHandThumb3', 'J_Bip_L_Index1': 'LeftHandIndex1',
  'J_Bip_L_Index2': 'LeftHandIndex2', 'J_Bip_L_Index3': 'LeftHandIndex3',
  'J_Bip_L_Middle1': 'LeftHandMiddle1', 'J_Bip_L_Middle2': 'LeftHandMiddle2',
  'J_Bip_L_Middle3': 'LeftHandMiddle3', 'J_Bip_L_Ring1': 'LeftHandRing1',
  'J_Bip_L_Ring2': 'LeftHandRing2', 'J_Bip_L_Ring3': 'LeftHandRing3',
  'J_Bip_L_Little1': 'LeftHandPinky1', 'J_Bip_L_Little2': 'LeftHandPinky2',
  'J_Bip_L_Little3': 'LeftHandPinky3', 'J_Bip_R_Shoulder': 'RightShoulder',
  'J_Bip_R_UpperArm': 'RightArm', 'J_Bip_R_LowerArm': 'RightForeArm',
  'J_Bip_R_Hand': 'RightHand', 'J_Bip_R_Thumb1': 'RightHandThumb1',
  'J_Bip_R_Thumb2': 'RightHandThumb2', 'J_Bip_R_Thumb3': 'RightHandThumb3',
  'J_Bip_R_Index1': 'RightHandIndex1', 'J_Bip_R_Index2': 'RightHandIndex2',
  'J_Bip_R_Index3': 'RightHandIndex3', 'J_Bip_R_Middle1': 'RightHandMiddle1',
  'J_Bip_R_Middle2': 'RightHandMiddle2', 'J_Bip_R_Middle3': 'RightHandMiddle3',
  'J_Bip_R_Ring1': 'RightHandRing1', 'J_Bip_R_Ring2': 'RightHandRing2',
  'J_Bip_R_Ring3': 'RightHandRing3', 'J_Bip_R_Little1': 'RightHandPinky1',
  'J_Bip_R_Little2': 'RightHandPinky2', 'J_Bip_R_Little3': 'RightHandPinky3',
  'J_Bip_L_UpperLeg': 'LeftUpLeg', 'J_Bip_L_LowerLeg': 'LeftLeg',
  'J_Bip_L_Foot': 'LeftFoot', 'J_Bip_L_ToeBase': 'LeftToeBase',
  'J_Bip_R_UpperLeg': 'RightUpLeg', 'J_Bip_R_LowerLeg': 'RightLeg',
  'J_Bip_R_Foot': 'RightFoot', 'J_Bip_R_ToeBase': 'RightToeBase',
  'J_Adj_L_FaceEye': 'LeftEye', 'J_Adj_R_FaceEye': 'RightEye',
  'J_Bip_L_Eye': 'LeftEye', 'J_Bip_R_Eye': 'RightEye',
}

// VRoid morph target names → ARKit/RPM names that TalkingHead requires.
// TalkingHead REQUIRES: eyeBlinkLeft, eyeBlinkRight, jawOpen, viseme_* etc.
// VRoid uses: Fcl_EYE_Close_L, Fcl_MTH_A, etc.
const VROID_MORPH_TO_ARKIT: Record<string, string> = {
  // Eyes
  'Fcl_EYE_Close_L': 'eyeBlinkLeft',
  'Fcl_EYE_Close_R': 'eyeBlinkRight',
  'Fcl_EYE_Close': 'eyeBlinkLeft',   // some exports have combined
  // Brows
  'Fcl_BRW_Angry_L': 'browDownLeft',
  'Fcl_BRW_Angry_R': 'browDownRight',
  'Fcl_BRW_Fun_L': 'browOuterUpLeft',
  'Fcl_BRW_Fun_R': 'browOuterUpRight',
  'Fcl_BRW_Sorrow_L': 'browInnerUp',
  // Mouth / jaw
  'Fcl_MTH_A': 'viseme_aa',
  'Fcl_MTH_I': 'viseme_I',
  'Fcl_MTH_U': 'viseme_U',
  'Fcl_MTH_E': 'viseme_E',
  'Fcl_MTH_O': 'viseme_O',
  'Fcl_MTH_Open': 'jawOpen',
  'Fcl_MTH_Angry': 'mouthFrownLeft',
  'Fcl_MTH_Fun': 'mouthSmileLeft',
  'Fcl_MTH_Joy': 'mouthSmileRight',
  'Fcl_MTH_Sorrow': 'mouthFrownRight',
  // Alternate naming conventions
  'eye_close_l': 'eyeBlinkLeft',
  'eye_close_r': 'eyeBlinkRight',
  'mouth_open': 'jawOpen',
  'mouth_a': 'viseme_aa',
  'mouth_i': 'viseme_I',
  'mouth_u': 'viseme_U',
  'mouth_e': 'viseme_E',
  'mouth_o': 'viseme_O',
}

async function patchVroidGlb(arrayBuffer: ArrayBuffer): Promise<string> {
  const view = new DataView(arrayBuffer)
  if (view.getUint32(0, true) !== 0x46546C67) {
    return URL.createObjectURL(new Blob([arrayBuffer], { type: 'model/gltf-binary' }))
  }
  const jsonChunkLen = view.getUint32(12, true)
  const jsonStr = new TextDecoder().decode(new Uint8Array(arrayBuffer, 20, jsonChunkLen))
  if (!jsonStr.includes('J_Bip_')) {
    return URL.createObjectURL(new Blob([arrayBuffer], { type: 'model/gltf-binary' }))
  }
  console.log('[Avatar] VRoid detected — remapping bones to Mixamo naming')
  const gltf = JSON.parse(jsonStr)

  // Step 1: Rename skin joint bones
  const boneIdxs = new Set<number>()
  for (const skin of (gltf.skins ?? [])) {
    for (const j of (skin.joints ?? [])) boneIdxs.add(j)
  }
  for (const idx of boneIdxs) {
    const node = gltf.nodes?.[idx]
    if (node && VROID_TO_MIXAMO[node.name]) node.name = VROID_TO_MIXAMO[node.name]
  }

  // Step 2: Remap VRoid morph target names → ARKit names in mesh extras
  // Morph target names live in mesh.primitives[].extras.targetNames
  for (const mesh of (gltf.meshes ?? [])) {
    for (const prim of (mesh.primitives ?? [])) {
      const targets = prim.extras?.targetNames
      if (Array.isArray(targets)) {
        for (let i = 0; i < targets.length; i++) {
          const mapped = VROID_MORPH_TO_ARKIT[targets[i]]
          if (mapped) {
            console.log('[Avatar] Morph remap:', targets[i], '→', mapped)
            targets[i] = mapped
          }
        }
      }
    }
  }

  // Step 3: Ensure LeftEye/RightEye nodes exist
  {
    const nodeNames = new Set((gltf.nodes ?? []).map((n: {name:string}) => n.name))
    if (!nodeNames.has('LeftEye') || !nodeNames.has('RightEye')) {
      const patterns: Array<{l: RegExp, r: RegExp}> = [
        { l: /J_Adj_L_FaceEye/, r: /J_Adj_R_FaceEye/ },
        { l: /J_Bip_L_Eye/, r: /J_Bip_R_Eye/ },
        { l: /eye.*left|left.*eye/i, r: /eye.*right|right.*eye/i },
      ]
      for (const { l, r } of patterns) {
        if (!nodeNames.has('LeftEye')) {
          const n = gltf.nodes?.find((n: {name:string}) => l.test(n.name))
          if (n) { n.name = 'LeftEye'; nodeNames.add('LeftEye') }
        }
        if (!nodeNames.has('RightEye')) {
          const n = gltf.nodes?.find((n: {name:string}) => r.test(n.name))
          if (n) { n.name = 'RightEye'; nodeNames.add('RightEye') }
        }
        if (nodeNames.has('LeftEye') && nodeNames.has('RightEye')) break
      }
    }
    if (!nodeNames.has('LeftEye') || !nodeNames.has('RightEye')) {
      const headIdx = (gltf.nodes ?? []).findIndex((n: {name:string}) => n.name === 'Head')
      if (headIdx >= 0) {
        const leftIdx = gltf.nodes.length
        const rightIdx = gltf.nodes.length + 1
        gltf.nodes.push({ name: 'LeftEye',  translation: [0.03,  0.07, 0.07] })
        gltf.nodes.push({ name: 'RightEye', translation: [-0.03, 0.07, 0.07] })
        if (!gltf.nodes[headIdx].children) gltf.nodes[headIdx].children = []
        gltf.nodes[headIdx].children.push(leftIdx, rightIdx)
      }
    }
  }

  // Step 4: Create Armature node
  const sceneNodes = gltf.scenes?.[0]?.nodes ?? []
  if (sceneNodes.length > 0) {
    const armatureIdx = gltf.nodes.length
    gltf.nodes.push({ name: 'Armature', children: [...sceneNodes] })
    gltf.scenes[0].nodes = [armatureIdx]
    console.log('[Avatar] Created Armature node wrapping', sceneNodes.length, 'children')
  }

  const newJsonBytes = new TextEncoder().encode(JSON.stringify(gltf))
  const newJsonPadded = Math.ceil(newJsonBytes.length / 4) * 4
  const jsonChunk = new Uint8Array(newJsonPadded).fill(0x20)
  jsonChunk.set(newJsonBytes)
  const binOffset = 20 + jsonChunkLen
  const binBytes = binOffset < arrayBuffer.byteLength
    ? new Uint8Array(arrayBuffer, binOffset) : new Uint8Array(0)
  const total = 12 + 8 + newJsonPadded + binBytes.length
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true)
  dv.setUint32(12, newJsonPadded, true); dv.setUint32(16, 0x4E4F534A, true)
  out.set(jsonChunk, 20); out.set(binBytes, 20 + newJsonPadded)
  console.log('[Avatar] VRoid bones patched — blob URL created')
  return URL.createObjectURL(new Blob([out.buffer], { type: 'model/gltf-binary' }))
}

interface Props { isActive: boolean; responseText: string }
declare global { interface Window { TalkingHead: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

const PROXY_URL = '/api/aria/avatar'

function Inner({ isActive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const blobUrlRef = useRef<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const prevActiveRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const go = () => initAvatar()
    if (window.TalkingHead) { go(); return }
    import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.3/modules/talkinghead.mjs')
      .then(mod => { window.TalkingHead = mod.TalkingHead ?? mod.default; go() })
      .catch(e => { console.error('[Avatar] CDN load failed:', e); setFailed(true) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function initAvatar() {
    if (!containerRef.current || headRef.current) return
    try {
      headRef.current = new window.TalkingHead(containerRef.current, {
        ttsEndpoint: '/api/aria/tts',
        ttsApikey: '',
        cameraView: 'upper',
        cameraRotateX: 6,
        cameraDistance: 0.7,
        cameraY: 0.07,
        backgroundColor: 'transparent',
        modelPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })

      // Try VRoid GLB first; if it fails (blend shapes not found), fall back to brunette
      let avatarUrl = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'
      let usingVroid = false
      try {
        const res = await fetch(PROXY_URL)
        if (res.ok) {
          const buf = await res.arrayBuffer()
          const patched = await patchVroidGlb(buf)
          blobUrlRef.current = patched
          avatarUrl = patched
          usingVroid = true
          console.log('[Avatar] Using Aria GLB from Blob store (bones patched)')
        }
      } catch (e) {
        console.warn('[Avatar] Blob fetch failed, using brunette fallback:', e)
      }

      const tryLoad = (url: string, onSuccess: () => void, onFail: () => void) => {
        headRef.current.showAvatar(
          { url, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' },
          onSuccess,
          (e: Error) => {
            console.error('[Avatar] load error:', e.message)
            onFail()
          }
        )
      }

      const onLoaded = () => { setLoaded(true); console.log('[Avatar] avatar loaded') }
      const onFinalFail = () => setFailed(true)

      if (usingVroid) {
        tryLoad(
          avatarUrl,
          onLoaded,
          // VRoid failed (likely "Blend shapes not found") — fall back to brunette
          () => {
            console.log('[Avatar] VRoid failed — falling back to brunette')
            const brunette = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'
            tryLoad(brunette, onLoaded, onFinalFail)
          }
        )
      } else {
        tryLoad(avatarUrl, onLoaded, onFinalFail)
      }
    } catch (e) { console.error('[Avatar] init error:', e); setFailed(true) }
  }

  useEffect(() => {
    if (!loaded || !headRef.current) return
    if (isActive === prevActiveRef.current) return
    prevActiveRef.current = isActive
    try { headRef.current.setMood(isActive ? 'happy' : 'neutral') } catch { /**/ }
  }, [isActive, loaded])

  useEffect(() => {
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current) }
  }, [])

  if (failed) return <AriaMonogram isActive={isActive} />

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(127,184,151,0.3)', borderTopColor: '#7FB897', animation: 'ariaSpin 0.8s linear infinite' }} />
          <span style={{ fontSize: 9, color: 'rgba(127,184,151,0.5)' }}>Aria</span>
        </div>
      )}
      {isActive && loaded && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, alignItems: 'flex-end', height: 12, pointerEvents: 'none' }}>
          {[5,9,7,8].map((h,i) => <div key={i} style={{ width: 2, borderRadius: 2, background: '#7FB897', height: h, animation: `ariaB${i} 0.5s ease-in-out infinite alternate`, animationDelay: `${i*0.12}s` }} />)}
        </div>
      )}
      <style>{`
        @keyframes ariaSpin{to{transform:rotate(360deg)}}
        @keyframes ariaB0{from{height:4px}to{height:8px}}@keyframes ariaB1{from{height:9px}to{height:3px}}
        @keyframes ariaB2{from{height:5px}to{height:9px}}@keyframes ariaB3{from{height:7px}to{height:4px}}
      `}</style>
    </div>
  )
}

export function AriaTalkingHead(props: Props) {
  return <AvatarErrorBoundary><Inner {...props} /></AvatarErrorBoundary>
}
