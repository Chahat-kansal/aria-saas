'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArchetypeViewerProps {
  modelPath: string
  fillColor: string    // hex e.g. '#8B5A3C'
  fillLevel: number    // 0..1
  foam?: boolean
  ice?: boolean
  size?: number        // canvas width+height px (square)
  clipsEnabled?: boolean
  clipPath?: string    // VP9-alpha .webm — e.g. '/menu/_lib/clips/caramel-pour.webm'
  clipPathMov?: string // HEVC-alpha .mov Safari fallback
  isTransparent?: boolean // true=column inside clear glass; false=top disc for opaque ceramic/paper
}

// ── Internals — shared across animation loop + effects ────────────────────────

interface ThreeState {
  renderer: THREE.WebGLRenderer | null
  scene: THREE.Scene | null
  camera: THREE.PerspectiveCamera | null
  model: THREE.Group | null
  liquidMesh: THREE.Mesh | null
  foamMesh: THREE.Mesh | null
  iceMeshes: THREE.Mesh[]
  currentFill: number
  targetFill: number
  vesselBottom: number
  maxLiquidHeight: number
  innerRadius: number
  isTransparentVessel: boolean
  isDragging: boolean
  lastX: number
  lastY: number
  rafId: number
}

function hexToVec3(hex: string): THREE.Vector3 {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return new THREE.Vector3(r, g, b)
}

function makeLiquidMaterial(fillColor: string) {
  const base = hexToVec3(fillColor)
  return new THREE.ShaderMaterial({
    uniforms: {
      uTopColor:    { value: new THREE.Vector3(Math.min(base.x * 1.35, 1), Math.min(base.y * 1.35, 1), Math.min(base.z * 1.35, 1)) },
      uBottomColor: { value: new THREE.Vector3(base.x * 0.5, base.y * 0.5, base.z * 0.5) },
      uOpacity:     { value: 0.88 },
    },
    vertexShader: `
      varying float vLocalY;
      void main() {
        vLocalY = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3  uTopColor;
      uniform vec3  uBottomColor;
      uniform float uOpacity;
      varying float vLocalY;
      void main() {
        float t = clamp(vLocalY + 0.5, 0.0, 1.0);
        vec3 color = mix(uBottomColor, uTopColor, t);
        gl_FragColor = vec4(color, uOpacity);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
  })
}

function updateLiquidColor(mesh: THREE.Mesh, fillColor: string) {
  const mat = mesh.material as THREE.ShaderMaterial
  if (!mat.uniforms) return
  const base = hexToVec3(fillColor)
  mat.uniforms.uTopColor.value.set(Math.min(base.x * 1.35, 1), Math.min(base.y * 1.35, 1), Math.min(base.z * 1.35, 1))
  mat.uniforms.uBottomColor.value.set(base.x * 0.5, base.y * 0.5, base.z * 0.5)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ArchetypeViewer({
  modelPath,
  fillColor,
  fillLevel,
  foam = false,
  ice = false,
  size = 320,
  clipsEnabled = false,
  clipPath,
  clipPathMov,
  isTransparent = false,
}: ArchetypeViewerProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const videoRef   = useRef<HTMLVideoElement>(null)
  // Clip trigger: fire only on modifier-driven fillColor changes, not on mount or drink swap
  const prevFillColorRef = useRef(fillColor)
  const modelChangedRef  = useRef(false)
  const [badgeVisible, setBadgeVisible] = useState(true)
  const [clipPlaying, setClipPlaying] = useState(false)

  const S = useRef<ThreeState>({
    renderer: null, scene: null, camera: null,
    model: null, liquidMesh: null, foamMesh: null, iceMeshes: [],
    currentFill: 0, targetFill: 0,
    vesselBottom: 0, maxLiquidHeight: 1, innerRadius: 0.15,
    isTransparentVessel: false,
    isDragging: false, lastX: 0, lastY: 0, rafId: 0,
  })

  // ── Effect 1: bootstrap renderer + scene + lights + animation loop ──────────
  useEffect(() => {
    if (!canvasRef.current) return
    const s = S.current

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(size, size)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    s.renderer = renderer

    const scene = new THREE.Scene()
    s.scene = scene

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50)
    camera.position.set(0, 0.25, 2.8)
    camera.lookAt(0, 0, 0)
    s.camera = camera

    // Lighting — soft tri-light setup
    const ambient = new THREE.AmbientLight(0xffffff, 1.4)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xfffaf0, 2.2)
    key.position.set(2, 4, 3)
    key.castShadow = true
    key.shadow.mapSize.setScalar(1024)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xf0f8ff, 1.0)
    fill.position.set(-2, 1, 1)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.6)
    rim.position.set(0, -1, -3)
    scene.add(rim)

    // Ground plane (shadow catcher)
    const groundGeo = new THREE.PlaneGeometry(4, 4)
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.9
    ground.receiveShadow = true
    scene.add(ground)

    // Animation loop
    function animate() {
      s.rafId = requestAnimationFrame(animate)

      if (s.model && !s.isDragging) {
        s.model.rotation.y += 0.004
      }

      // Liquid fill lerp
      if (s.liquidMesh && Math.abs(s.targetFill - s.currentFill) > 0.001) {
        s.currentFill += (s.targetFill - s.currentFill) * 0.06
        const h = s.maxLiquidHeight * s.currentFill

        if (s.isTransparentVessel) {
          // Column mode (clear glass/smoothie): scale cylinder height, rise from floor
          s.liquidMesh.scale.y = Math.max(h, 0.0001)
          s.liquidMesh.position.y = s.vesselBottom + h / 2
          s.liquidMesh.visible = s.currentFill > 0.01
          if (s.foamMesh) {
            s.foamMesh.position.y = s.vesselBottom + h + 0.01
            s.foamMesh.visible = foam && s.currentFill > 0.1
          }
        } else {
          // Disc mode (opaque ceramic/paper cup): flat circle rises to coffee surface
          s.liquidMesh.position.y = s.vesselBottom + h
          s.liquidMesh.visible = s.currentFill > 0.01
          if (s.foamMesh) {
            s.foamMesh.position.y = s.vesselBottom + h + 0.008
            s.foamMesh.visible = foam && s.currentFill > 0.1
          }
        }

        // Ice floats near top of fill (visible through clear vessel or cup opening)
        if (s.iceMeshes.length > 0) {
          const topY = s.vesselBottom + h - 0.04
          s.iceMeshes.forEach((cube, i) => {
            const offset = [0, 0.035, -0.02, 0.04, -0.03][i] ?? 0
            cube.position.y = topY + offset
            cube.rotation.y += 0.003
            cube.visible = ice && s.currentFill > 0.15
          })
        }
      }

      if (s.renderer && s.scene && s.camera) {
        s.renderer.render(s.scene, s.camera)
      }
    }
    animate()

    // ── Drag-rotate handlers ──────────────────────────────────────────────────
    const canvas = canvasRef.current
    function onPointerDown(e: PointerEvent) {
      s.isDragging = true
      s.lastX = e.clientX
      s.lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
      setBadgeVisible(false)
    }
    function onPointerMove(e: PointerEvent) {
      if (!s.isDragging || !s.model) return
      const dx = e.clientX - s.lastX
      const dy = e.clientY - s.lastY
      s.model.rotation.y += dx * 0.012
      s.model.rotation.x = Math.max(-0.4, Math.min(0.4, s.model.rotation.x + dy * 0.006))
      s.lastX = e.clientX
      s.lastY = e.clientY
    }
    function onPointerUp() {
      s.isDragging = false
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerUp)

    return () => {
      cancelAnimationFrame(s.rafId)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerUp)
      renderer.dispose()
      s.renderer = null
      s.scene = null
      s.camera = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  // ── Effect 2: load/reload GLB when modelPath or foam/ice changes ─────────────
  useEffect(() => {
    const s = S.current
    if (!s.scene) return

    // Signal Effect 3 that this fillColor change comes from a drink/model swap
    modelChangedRef.current = true

    // Teardown previous model + fill meshes
    function disposeObj(obj: THREE.Object3D | null) {
      if (!obj) return
      obj.traverse(child => {
        const m = child as THREE.Mesh
        if (m.isMesh) {
          m.geometry?.dispose()
          const mat = Array.isArray(m.material) ? m.material : [m.material]
          mat.forEach(mt => mt?.dispose())
        }
      })
      s.scene?.remove(obj)
    }
    disposeObj(s.model)
    disposeObj(s.liquidMesh)
    disposeObj(s.foamMesh)
    s.iceMeshes.forEach(c => disposeObj(c))
    s.model = null; s.liquidMesh = null; s.foamMesh = null; s.iceMeshes = []
    s.currentFill = 0; s.targetFill = fillLevel

    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
    const loader = new GLTFLoader()
    loader.setDRACOLoader(dracoLoader)

    let cancelled = false

    loader.load(
      modelPath,
      (gltf) => {
        if (cancelled || !s.scene) return

        const model = gltf.scene as THREE.Group
        model.traverse(child => {
          const m = child as THREE.Mesh
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true }
        })

        // Center model at origin
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const sz = box.getSize(new THREE.Vector3())
        model.position.set(-center.x, -center.y + sz.y * 0.05, -center.z)
        s.scene.add(model)
        s.model = model

        // Vessel interior geometry estimates
        const vesselH = sz.y
        s.vesselBottom        = -vesselH * 0.44
        s.maxLiquidHeight     = vesselH * 0.70
        s.isTransparentVessel = isTransparent

        const liqMat = makeLiquidMaterial(fillColor)

        if (isTransparent) {
          // ── Column liquid (clear glass / smoothie) ──────────────────────────
          // Radius inset ~10 % from outer bounds to stay inside glass walls.
          // Use sz.z (depth) as the width reference — handles don't inflate it.
          s.innerRadius = Math.min(sz.x, sz.z) * 0.27
          const liqGeo = new THREE.CylinderGeometry(s.innerRadius, s.innerRadius * 0.92, 1, 36, 1, false)
          const liquidMesh = new THREE.Mesh(liqGeo, liqMat)
          liquidMesh.scale.y = 0.0001
          liquidMesh.position.y = s.vesselBottom
          liquidMesh.visible = false
          liquidMesh.renderOrder = 1
          s.scene.add(liquidMesh)
          s.liquidMesh = liquidMesh

          const foamGeo = new THREE.CylinderGeometry(s.innerRadius * 0.96, s.innerRadius * 0.96, 0.04, 36)
          const foamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.96, 0.92, 0.86), roughness: 0.9, metalness: 0.0, transparent: true, opacity: 0.92 })
          const foamMesh = new THREE.Mesh(foamGeo, foamMat)
          foamMesh.position.y = s.vesselBottom
          foamMesh.visible = false
          foamMesh.renderOrder = 2
          s.scene.add(foamMesh)
          s.foamMesh = foamMesh
        } else {
          // ── Disc liquid (opaque ceramic / paper cup) ────────────────────────
          // Flat circle at the coffee surface — no side walls, never bleeds through.
          // Conservative radius: sz.z avoids handle inflation on mugs.
          s.innerRadius = Math.min(sz.x, sz.z) * 0.24
          const liqGeo = new THREE.CylinderGeometry(s.innerRadius, s.innerRadius, 0.012, 36, 1, false)
          const liquidMesh = new THREE.Mesh(liqGeo, liqMat)
          liquidMesh.position.y = s.vesselBottom   // animation loop moves it up
          liquidMesh.visible = false
          liquidMesh.renderOrder = 1
          s.scene.add(liquidMesh)
          s.liquidMesh = liquidMesh

          // Crema / foam ring sits just above the coffee disc
          const foamGeo = new THREE.CylinderGeometry(s.innerRadius * 0.96, s.innerRadius * 0.96, 0.016, 36)
          const foamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.96, 0.92, 0.86), roughness: 0.9, metalness: 0.0, transparent: true, opacity: 0.92 })
          const foamMesh = new THREE.Mesh(foamGeo, foamMat)
          foamMesh.position.y = s.vesselBottom
          foamMesh.visible = false
          foamMesh.renderOrder = 2
          s.scene.add(foamMesh)
          s.foamMesh = foamMesh
        }

        // ── Ice cubes ──────────────────────────────────────────────────────────
        if (ice) {
          const iceGeo = new THREE.BoxGeometry(s.innerRadius * 0.45, s.innerRadius * 0.42, s.innerRadius * 0.45)
          const iceMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(0.88, 0.96, 1.0),
            transparent: true, opacity: 0.52,
            roughness: 0.04, metalness: 0.0,
            transmission: 0.45, ior: 1.31,
          })
          const OFFSETS: Array<[number, number]> = [
            [0, 0], [s.innerRadius * 0.5, s.innerRadius * 0.3],
            [-s.innerRadius * 0.45, s.innerRadius * 0.1],
            [s.innerRadius * 0.15, -s.innerRadius * 0.5],
            [-s.innerRadius * 0.2, -s.innerRadius * 0.35],
          ]
          const cubes = OFFSETS.map(([ox, oz], i) => {
            const cube = new THREE.Mesh(iceGeo, iceMat)
            cube.position.set(ox, s.vesselBottom + s.maxLiquidHeight * 0.72, oz)
            cube.rotation.set(0.2 * i, 0.6 * i, 0.3 * i)
            cube.visible = false
            cube.renderOrder = 3
            s.scene!.add(cube)
            return cube
          })
          s.iceMeshes = cubes
        }

        // Kick off fill animation
        s.targetFill = fillLevel
      },
      undefined,
      (err) => console.warn('[ArchetypeViewer] GLB load error:', err)
    )

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelPath, ice, foam, isTransparent])

  // ── Effect 3: react to fillColor / fillLevel changes ─────────────────────────
  useEffect(() => {
    const s = S.current

    // Pour clip: fire ONLY when a modifier changes fillColor on the same vessel.
    // Skip: initial mount (prevFillColorRef starts equal to fillColor) and
    // drink/vessel swaps (modelChangedRef set true by Effect 2).
    const colorChanged     = fillColor !== prevFillColorRef.current
    const fromModelChange  = modelChangedRef.current
    modelChangedRef.current   = false
    prevFillColorRef.current  = fillColor

    if (clipsEnabled && colorChanged && !fromModelChange && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => null)
      setClipPlaying(true)
    }

    s.targetFill = fillLevel
    if (s.liquidMesh) updateLiquidColor(s.liquidMesh, fillColor)
  }, [fillColor, fillLevel, clipsEnabled])

  // ── Render ────────────────────────────────────────────────────────────────────

  const CANVAS  = '#fafafa'
  const BADGE_BG = 'rgba(0,0,0,0.45)'

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 24,
        background: CANVAS,
        boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'grab', width: '100%', height: '100%' }}
      />

      {/* Pour clip overlay — VP9-alpha WebM composites without black box.
          Show element whenever clipsEnabled so videoRef is always mounted;
          visibility controlled by opacity. */}
      {clipsEnabled && (clipPath || clipPathMov) && (
        <video
          ref={videoRef}
          muted
          playsInline
          preload="auto"
          onEnded={() => setClipPlaying(false)}
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            opacity: clipPlaying ? 1 : 0,
            transition: 'opacity 0.3s ease',
            background: 'transparent',
          }}
        >
          {clipPath && <source src={clipPath} type="video/webm; codecs=vp9" />}
          {clipPathMov && <source src={clipPathMov} type="video/mp4; codecs=hvc1" />}
        </video>
      )}

      {/* "360° drag to rotate" badge */}
      {badgeVisible && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: BADGE_BG,
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.03em',
            padding: '4px 10px',
            borderRadius: 20,
            pointerEvents: 'none',
            fontFamily: "'Inter', system-ui, sans-serif",
            whiteSpace: 'nowrap',
          }}
        >
          360° drag to rotate
        </div>
      )}
    </div>
  )
}