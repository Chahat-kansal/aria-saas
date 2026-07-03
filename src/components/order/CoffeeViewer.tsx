'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export interface CoffeeViewerProps {
  slug: string
  sizeScale?: number
  size?: number
}

interface CoffeeState {
  renderer: THREE.WebGLRenderer | null
  scene: THREE.Scene | null
  camera: THREE.PerspectiveCamera | null
  model: THREE.Group | null
  pedestal: THREE.Mesh | null
  shadowPlane: THREE.Mesh | null
  isDragging: boolean
  lastX: number
  lastY: number
  velY: number
  lastDragAt: number
  rafId: number
}

export function CoffeeViewer({ slug, sizeScale = 1.0, size = 320 }: CoffeeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hintVisible, setHintVisible] = useState(true)
  const sizeScaleRef = useRef(sizeScale)

  const S = useRef<CoffeeState>({
    renderer: null, scene: null, camera: null,
    model: null, pedestal: null, shadowPlane: null,
    isDragging: false, lastX: 0, lastY: 0,
    velY: 0, lastDragAt: 0, rafId: 0,
  })

  // Effect 1: bootstrap renderer, scene, PMREM env, lights, pedestal, animation loop, drag
  useEffect(() => {
    if (!canvasRef.current) return
    const s = S.current

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(size, size)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    s.renderer = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xfafafa)
    s.scene = scene

    // PMREM env map from RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50)
    camera.position.set(0, 0.05, 2.9)
    camera.lookAt(0, 0, 0)
    s.camera = camera

    // 3-point lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const key = new THREE.DirectionalLight(0xfff8f0, 2.6)
    key.position.set(2.5, 5, 3.5)
    key.castShadow = true
    key.shadow.mapSize.setScalar(1024)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 20
    key.shadow.camera.left = -2
    key.shadow.camera.right = 2
    key.shadow.camera.top = 2
    key.shadow.camera.bottom = -2
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xf0f8ff, 0.7)
    fill.position.set(-3, 2, 1)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.35)
    rim.position.set(0.5, -0.5, -3)
    scene.add(rim)

    // Pedestal disc (Pipel #fafafa) — Y repositioned in Effect 2 after model loads
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 0.020, 56),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(0xfafafa), roughness: 0.82 }),
    )
    pedestal.position.y = -2  // hidden until Effect 2 repositions
    pedestal.receiveShadow = true
    scene.add(pedestal)
    s.pedestal = pedestal

    // Contact shadow plane
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.ShadowMaterial({ opacity: 0.08 }),
    )
    shadowPlane.rotation.x = -Math.PI / 2
    shadowPlane.position.y = -2.005
    shadowPlane.receiveShadow = true
    scene.add(shadowPlane)
    s.shadowPlane = shadowPlane

    // Animation loop
    const AUTO_SPIN = 0.004
    const DAMPING = 0.88
    const RESUME_MS = 2000

    function animate() {
      s.rafId = requestAnimationFrame(animate)
      if (s.model && !s.isDragging) {
        const now = performance.now()
        if (Math.abs(s.velY) > 0.0004) {
          s.velY *= DAMPING
          s.model.rotation.y += s.velY
        } else if (now - s.lastDragAt > RESUME_MS) {
          s.model.rotation.y += AUTO_SPIN
        }
      }
      if (s.renderer && s.scene && s.camera) {
        s.renderer.render(s.scene, s.camera)
      }
    }
    animate()

    // Pointer drag handlers
    const canvas = canvasRef.current
    function onDown(e: PointerEvent) {
      s.isDragging = true
      s.lastX = e.clientX
      s.lastY = e.clientY
      s.velY = 0
      canvas.setPointerCapture(e.pointerId)
      setHintVisible(false)
    }
    function onMove(e: PointerEvent) {
      if (!s.isDragging || !s.model) return
      const dx = e.clientX - s.lastX
      const dy = e.clientY - s.lastY
      s.velY = dx * 0.012
      s.model.rotation.y += s.velY
      s.model.rotation.x = Math.max(-0.35, Math.min(0.35, s.model.rotation.x + dy * 0.006))
      s.lastX = e.clientX
      s.lastY = e.clientY
      s.lastDragAt = performance.now()
    }
    function onUp() {
      s.isDragging = false
      s.lastDragAt = performance.now()
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onUp)

    return () => {
      cancelAnimationFrame(s.rafId)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onUp)
      renderer.dispose()
      s.renderer = null
      s.scene = null
      s.camera = null
      s.pedestal = null
      s.shadowPlane = null
    }
  }, [size])

  // Effect 2: load GLB for slug
  useEffect(() => {
    const s = S.current
    if (!s.scene) return

    // Dispose previous model
    if (s.model) {
      s.model.traverse(child => {
        const m = child as THREE.Mesh
        if (m.isMesh) {
          m.geometry?.dispose()
          const mats = Array.isArray(m.material) ? m.material : [m.material]
          mats.forEach(mt => (mt as THREE.Material)?.dispose())
        }
      })
      s.scene.remove(s.model)
      s.model = null
    }

    if (!slug) return

    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)

    let cancelled = false

    loader.load(
      '/menu/_lib/models/coffee/' + slug + '.glb',
      (gltf) => {
        if (cancelled || !s.scene) return
        const model = gltf.scene as THREE.Group
        model.traverse(child => {
          const m = child as THREE.Mesh
          if (m.isMesh) {
            m.castShadow = true
            m.receiveShadow = true
          }
        })

        // Center model at world origin
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const sz = box.getSize(new THREE.Vector3())
        model.position.set(-center.x, -center.y, -center.z)
        model.scale.setScalar(sizeScaleRef.current)

        // Reposition pedestal just below model base
        const worldBottom = -sz.y / 2
        if (s.pedestal) s.pedestal.position.y = worldBottom - 0.012
        if (s.shadowPlane) s.shadowPlane.position.y = worldBottom - 0.016

        s.scene.add(model)
        s.model = model
      },
      undefined,
      (err) => console.warn('[CoffeeViewer] GLB load error:', slug, err),
    )

    return () => { cancelled = true }
  }, [slug])

  // Effect 3: scale change without GLB reload
  useEffect(() => {
    sizeScaleRef.current = sizeScale
    if (S.current.model) {
      S.current.model.scale.setScalar(sizeScale)
    }
  }, [sizeScale])

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 24,
        background: '#fafafa',
        boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none' as React.CSSProperties['WebkitUserSelect'],
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'grab', width: size + 'px', height: size + 'px' }}
      />
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
          }}
        >
          Drag to rotate
        </div>
      )}
    </div>
  )
}