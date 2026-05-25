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

// VRoid bone → short bone name mapping (all 51 bones TalkingHead requires)
// TalkingHead strips 'mixamorig' prefix itself (talkinghead.mjs:1254)
// so we use bare names matching what remains after stripping
const VROID_TO_MIXAMO: Record<string, string> = {
  // Spine
  'J_Bip_C_Hips':               'Hips',
  'J_Bip_C_Spine':              'Spine',
  'J_Bip_C_Chest':              'Spine1',
  'J_Bip_C_UpperChest':         'Spine2',
  'J_Bip_C_Neck':               'Neck',
  'J_Bip_C_Head':               'Head',
  // Left arm
  'J_Bip_L_Shoulder':           'LeftShoulder',
  'J_Bip_L_UpperArm':           'LeftArm',
  'J_Bip_L_LowerArm':           'LeftForeArm',
  'J_Bip_L_Hand':               'LeftHand',
  // Left fingers
  'J_Bip_L_Thumb1':             'LeftHandThumb1',
  'J_Bip_L_Thumb2':             'LeftHandThumb2',
  'J_Bip_L_Thumb3':             'LeftHandThumb3',
  'J_Bip_L_Index1':             'LeftHandIndex1',
  'J_Bip_L_Index2':             'LeftHandIndex2',
  'J_Bip_L_Index3':             'LeftHandIndex3',
  'J_Bip_L_Middle1':            'LeftHandMiddle1',
  'J_Bip_L_Middle2':            'LeftHandMiddle2',
  'J_Bip_L_Middle3':            'LeftHandMiddle3',
  'J_Bip_L_Ring1':              'LeftHandRing1',
  'J_Bip_L_Ring2':              'LeftHandRing2',
  'J_Bip_L_Ring3':              'LeftHandRing3',
  'J_Bip_L_Little1':            'LeftHandPinky1',
  'J_Bip_L_Little2':            'LeftHandPinky2',
  'J_Bip_L_Little3':            'LeftHandPinky3',
  // Right arm
  'J_Bip_R_Shoulder':           'RightShoulder',
  'J_Bip_R_UpperArm':           'RightArm',
  'J_Bip_R_LowerArm':           'RightForeArm',
  'J_Bip_R_Hand':               'RightHand',
  // Right fingers
  'J_Bip_R_Thumb1':             'RightHandThumb1',
  'J_Bip_R_Thumb2':             'RightHandThumb2',
  'J_Bip_R_Thumb3':             'RightHandThumb3',
  'J_Bip_R_Index1':             'RightHandIndex1',
  'J_Bip_R_Index2':             'RightHandIndex2',
  'J_Bip_R_Index3':             'RightHandIndex3',
  'J_Bip_R_Middle1':            'RightHandMiddle1',
  'J_Bip_R_Middle2':            'RightHandMiddle2',
  'J_Bip_R_Middle3':            'RightHandMiddle3',
  'J_Bip_R_Ring1':              'RightHandRing1',
  'J_Bip_R_Ring2':              'RightHandRing2',
  'J_Bip_R_Ring3':              'RightHandRing3',
  'J_Bip_R_Little1':            'RightHandPinky1',
  'J_Bip_R_Little2':            'RightHandPinky2',
  'J_Bip_R_Little3':            'RightHandPinky3',
  // Legs
  'J_Bip_L_UpperLeg':           'LeftUpLeg',
  'J_Bip_L_LowerLeg':           'LeftLeg',
  'J_Bip_L_Foot':               'LeftFoot',
  'J_Bip_L_ToeBase':            'LeftToeBase',
  'J_Bip_R_UpperLeg':           'RightUpLeg',
  'J_Bip_R_LowerLeg':           'RightLeg',
  'J_Bip_R_Foot':               'RightFoot',
  'J_Bip_R_ToeBase':            'RightToeBase',
}

// Patch VRoid GLB for TalkingHead v1.3 compatibility:
// 1. Rename skin joint bones (J_Bip_* → short Mixamo names)
// 2. Create an "Armature" node that parents BOTH the skeleton root AND all mesh nodes
//    (TalkingHead v1.3 requires "Armature" to exist AND traverses it for morph targets)
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

  // Step 1: Rename skin joint nodes only
  const boneIdxs = new Set<number>()
  for (const skin of (gltf.skins ?? [])) {
    for (const j of (skin.joints ?? [])) boneIdxs.add(j)
  }
  for (const idx of boneIdxs) {
    const node = gltf.nodes?.[idx]
    if (node && VROID_TO_MIXAMO[node.name]) node.name = VROID_TO_MIXAMO[node.name]
  }

  // Step 2: Create a new "Armature" node that owns ALL top-level scene children
  // VRoid scene structure: scene.nodes = [skeletonRootIdx, meshIdx1, meshIdx2, ...]
  // We need: Armature → [skeletonRoot, mesh1, mesh2, ...]
  // So TalkingHead's armature.traverse() finds both bones AND mesh morph targets
  const sceneNodes = gltf.scenes?.[0]?.nodes ?? []
  if (sceneNodes.length > 0) {
    // Add new Armature node at end of nodes array
    const armatureIdx = gltf.nodes.length
    gltf.nodes.push({ name: 'Armature', children: [...sceneNodes] })
    // Replace scene children with just the Armature node
    gltf.scenes[0].nodes = [armatureIdx]
    console.log('[Avatar] Created Armature node wrapping', sceneNodes.length, 'children')
  }

  // Rebuild GLB
  const newJsonBytes = new TextEncoder().encode(JSON.stringify(gltf))
  const newJsonPadded = Math.ceil(newJsonBytes.length / 4) * 4
  const jsonChunk = new Uint8Array(newJsonPadded).fill(0x20)
  jsonChunk.set(newJsonBytes)

  const binOffset = 20 + jsonChunkLen
  const binBytes = binOffset < arrayBuffer.byteLength
    ? new Uint8Array(arrayBuffer, binOffset)
    : new Uint8Array(0)

  const total = 12 + 8 + newJsonPadded + binBytes.length
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546C67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, newJsonPadded, true)
  dv.setUint32(16, 0x4E4F534A, true)
  out.set(jsonChunk, 20)
  out.set(binBytes, 20 + newJsonPadded)

  console.log('[Avatar] VRoid bones patched — blob URL created')
  return URL.createObjectURL(new Blob([out.buffer], { type: 'model/gltf-binary' }))
}

interface Props { isActive: boolean; responseText: string }
declare global { interface Window { TalkingHead: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

// Priority: Blob store GLB (via proxy) → brunette fallback
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
        // modelRoot left as default "Armature" — not found in VRoid GLB
        // → TalkingHead falls back to gltf.scene (L1294-1295 in talkinghead.mjs)
        // → traverse finds ALL nodes including mesh nodes with morph targets
      })

      // Fetch the avatar, patch VRoid bones if needed, then show
      let avatarUrl = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'
      try {
        const res = await fetch(PROXY_URL)
        if (res.ok) {
          const buf = await res.arrayBuffer()
          const patched = await patchVroidGlb(buf)
          blobUrlRef.current = patched
          avatarUrl = patched
          console.log('[Avatar] Using Aria GLB from Blob store (bones patched)')
        }
      } catch (e) {
        console.warn('[Avatar] Blob fetch failed, using brunette fallback:', e)
      }

      headRef.current.showAvatar(
        { url: avatarUrl, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' },
        () => { setLoaded(true); console.log('[Avatar] avatar loaded') },
        (e: Error) => {
          console.error('[Avatar] avatar load error:', e)
          // If patched VRoid still fails, fall back to brunette
          if (blobUrlRef.current && avatarUrl === blobUrlRef.current) {
            console.log('[Avatar] VRoid patch failed — falling back to brunette')
            const fallback = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'
            headRef.current?.showAvatar(
              { url: fallback, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' },
              () => setLoaded(true),
              () => setFailed(true)
            )
          } else {
            setFailed(true)
          }
        }
      )
    } catch (e) { console.error('[Avatar] init error:', e); setFailed(true) }
  }

  useEffect(() => {
    if (!loaded || !headRef.current) return
    if (isActive === prevActiveRef.current) return
    prevActiveRef.current = isActive
    try { headRef.current.setMood(isActive ? 'happy' : 'neutral') } catch { /**/ }
  }, [isActive, loaded])

  // Cleanup blob URL on unmount
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
