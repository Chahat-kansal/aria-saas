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

// VRoid bone → Mixamo bone name mapping
// TalkingHead requires Mixamo naming ("Armature" as root + mixamorig: prefix)
const VROID_TO_MIXAMO: Record<string, string> = {
  'J_Bip_C_Hips':          'mixamorig:Hips',
  'J_Bip_C_Spine':         'mixamorig:Spine',
  'J_Bip_C_Chest':         'mixamorig:Spine1',
  'J_Bip_C_UpperChest':    'mixamorig:Spine2',
  'J_Bip_C_Neck':          'mixamorig:Neck',
  'J_Bip_C_Head':          'mixamorig:Head',
  'J_Bip_L_Shoulder':      'mixamorig:LeftShoulder',
  'J_Bip_L_UpperArm':      'mixamorig:LeftArm',
  'J_Bip_L_LowerArm':      'mixamorig:LeftForeArm',
  'J_Bip_L_Hand':          'mixamorig:LeftHand',
  'J_Bip_R_Shoulder':      'mixamorig:RightShoulder',
  'J_Bip_R_UpperArm':      'mixamorig:RightArm',
  'J_Bip_R_LowerArm':      'mixamorig:RightForeArm',
  'J_Bip_R_Hand':          'mixamorig:RightHand',
  'J_Bip_L_UpperLeg':      'mixamorig:LeftUpLeg',
  'J_Bip_L_LowerLeg':      'mixamorig:LeftLeg',
  'J_Bip_L_Foot':          'mixamorig:LeftFoot',
  'J_Bip_L_ToeBase':       'mixamorig:LeftToeBase',
  'J_Bip_R_UpperLeg':      'mixamorig:RightUpLeg',
  'J_Bip_R_LowerLeg':      'mixamorig:RightLeg',
  'J_Bip_R_Foot':          'mixamorig:RightFoot',
  'J_Bip_R_ToeBase':       'mixamorig:RightToeBase',
}

// Rename VRoid bones in a GLB binary so TalkingHead can read them
// GLB = 12-byte header + JSON chunk + BIN chunk
// We patch the JSON chunk's node names in-place (or rebuild if lengths change)
async function patchVroidGlb(arrayBuffer: ArrayBuffer): Promise<string> {
  const view = new DataView(arrayBuffer)
  // GLB header: magic(4) + version(4) + length(4)
  const magic = view.getUint32(0, true)
  if (magic !== 0x46546C67) return URL.createObjectURL(new Blob([arrayBuffer], { type: 'model/gltf-binary' }))

  const jsonChunkLength = view.getUint32(12, true)
  // const jsonChunkType = view.getUint32(16, true) // 0x4E4F534A = JSON
  const jsonBytes = new Uint8Array(arrayBuffer, 20, jsonChunkLength)
  let jsonStr = new TextDecoder().decode(jsonBytes)

  // Check if this is a VRoid model
  if (!jsonStr.includes('J_Bip_')) {
    return URL.createObjectURL(new Blob([arrayBuffer], { type: 'model/gltf-binary' }))
  }

  console.log('[Avatar] VRoid detected — remapping bones to Mixamo naming')

  // Replace bone names in the JSON
  for (const [vroid, mixamo] of Object.entries(VROID_TO_MIXAMO)) {
    // Match exact bone names in JSON strings
    jsonStr = jsonStr.replaceAll(`"${vroid}"`, `"${mixamo}"`)
  }

  // TalkingHead looks for a node named "Armature" as the skeleton root
  // VRoid uses the model name or "Armature" — add it if missing
  // Find the node that contains mixamorig:Hips as a child and rename it Armature
  const gltf = JSON.parse(jsonStr)
  const hipsIdx = gltf.nodes?.findIndex((n: {name: string}) => n.name === 'mixamorig:Hips')
  if (hipsIdx >= 0) {
    // Find parent of Hips — that should be Armature
    const parentIdx = gltf.nodes?.findIndex((n: {children?: number[]}) =>
      Array.isArray(n.children) && n.children.includes(hipsIdx)
    )
    if (parentIdx >= 0 && gltf.nodes[parentIdx].name !== 'Armature') {
      console.log('[Avatar] Renaming root bone to Armature:', gltf.nodes[parentIdx].name)
      gltf.nodes[parentIdx].name = 'Armature'
    }
  }

  const patchedJson = JSON.stringify(gltf)
  const patchedJsonBytes = new TextEncoder().encode(patchedJson)
  // Pad to 4-byte alignment
  const paddedLength = Math.ceil(patchedJsonBytes.length / 4) * 4
  const paddedJson = new Uint8Array(paddedLength)
  paddedJson.set(patchedJsonBytes)
  // Fill padding with spaces (0x20) — GLB spec requires JSON chunk padding with spaces
  paddedJson.fill(0x20, patchedJsonBytes.length)

  // Rebuild GLB
  const binOffset = 20 + jsonChunkLength
  const binChunk = new Uint8Array(arrayBuffer, binOffset)
  const newLength = 12 + 8 + paddedLength + binChunk.length
  const out = new ArrayBuffer(newLength)
  const outView = new DataView(out)
  const outBytes = new Uint8Array(out)

  // Header
  outView.setUint32(0, 0x46546C67, true)  // magic
  outView.setUint32(4, 2, true)            // version
  outView.setUint32(8, newLength, true)    // total length

  // JSON chunk
  outView.setUint32(12, paddedLength, true)
  outView.setUint32(16, 0x4E4F534A, true)  // JSON
  outBytes.set(paddedJson, 20)

  // BIN chunk (unchanged)
  outBytes.set(binChunk, 20 + paddedLength)

  const blob = new Blob([out], { type: 'model/gltf-binary' })
  const url = URL.createObjectURL(blob)
  console.log('[Avatar] VRoid bones patched — blob URL created')
  return url
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
