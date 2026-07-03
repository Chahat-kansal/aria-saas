// ProceduralVessel.ts — builds three.js geometry for each coffee vessel type.
// All vessels are centered at world origin (Y=0 ≈ mid-height).
// Caller (ArchetypeViewer) tilts the group ~8° toward camera so the interior shows.
import * as THREE from 'three'
import type { VesselKey } from '@/lib/drinkFills'

// ── Return type ───────────────────────────────────────────────────────────────

export interface ProceduralVesselResult {
  group: THREE.Group
  innerRadius: number   // fill cylinder / disc radius
  innerHeight: number   // interior height (maxLiquidHeight)
  vesselBottom: number  // Y of the interior floor
  isTransparent: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Pt = { r: number; y: number }

function lathe(pts: Pt[], segs = 64): THREE.LatheGeometry {
  return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p.r, p.y)), segs)
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ── Materials ─────────────────────────────────────────────────────────────────

function ceramicMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.97, 0.96, 0.945),
    roughness: 0.35,
    metalness: 0.0,
  })
}

function ceramicInnerMat(): THREE.MeshStandardMaterial {
  // Slightly warmer inside the cup (fired clay shadow)
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.95, 0.94, 0.92),
    roughness: 0.45,
    metalness: 0.0,
    side: THREE.BackSide,
  })
}

function kraftMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.84, 0.63, 0.38),
    roughness: 0.85,
    metalness: 0.0,
  })
}

function sleeveMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.72, 0.50, 0.28),
    roughness: 0.92,
    metalness: 0.0,
  })
}

function darkLidMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.18, 0.14, 0.10),
    roughness: 0.60,
    metalness: 0.0,
  })
}

function glassMat(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.88, 0.96, 1.0),
    transmission: 0.93,
    thickness: 0.30,
    roughness: 0.06,
    metalness: 0.0,
    ior: 1.50,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
}

function plasticMat(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.92, 0.97, 1.0),
    transmission: 0.88,
    thickness: 0.15,
    roughness: 0.10,
    metalness: 0.0,
    ior: 1.46,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
}

// ── cup-hot-dinein — white ceramic cup + handle + saucer ──────────────────────

function buildCupHotDinein(): ProceduralVesselResult {
  const group = new THREE.Group()
  const mat = ceramicMat()

  // Outer cup body (LatheGeometry — closed at base via r=0 start point)
  const cupProfile: Pt[] = [
    { r: 0.000, y: -0.400 }, // center base
    { r: 0.220, y: -0.400 }, // base outer
    { r: 0.232, y: -0.376 }, // base shoulder
    { r: 0.242, y: -0.300 }, // lower body
    { r: 0.258, y: -0.100 }, // mid body
    { r: 0.278, y:  0.180 }, // upper body
    { r: 0.298, y:  0.370 }, // near rim
    { r: 0.305, y:  0.402 }, // rim outer peak
    { r: 0.298, y:  0.405 }, // rim lip fold
  ]
  group.add(mesh(lathe(cupProfile, 64), mat))

  // Inner wall (BackSide so interior is shaded warmer)
  const innerProfile: Pt[] = [
    { r: 0.000, y: -0.382 },
    { r: 0.200, y: -0.382 },
    { r: 0.210, y: -0.368 },
    { r: 0.220, y: -0.290 },
    { r: 0.236, y: -0.090 },
    { r: 0.254, y:  0.175 },
    { r: 0.270, y:  0.370 },
    { r: 0.278, y:  0.400 },
  ]
  group.add(mesh(lathe(innerProfile, 64), ceramicInnerMat()))

  // Handle — quadratic bezier tube on the right side
  const hCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0.272,  0.16, 0),
    new THREE.Vector3(0.52,  -0.04, 0),
    new THREE.Vector3(0.252, -0.24, 0),
  )
  const handleGeo = new THREE.TubeGeometry(hCurve, 14, 0.028, 10, false)
  group.add(mesh(handleGeo, mat))

  // Saucer body
  const saucerGeo = new THREE.CylinderGeometry(0.500, 0.464, 0.050, 56)
  const saucer = mesh(saucerGeo, mat)
  saucer.position.y = -0.480
  group.add(saucer)

  // Saucer shallow well (indent where cup sits)
  const wellGeo = new THREE.CylinderGeometry(0.240, 0.228, 0.024, 48)
  const well = mesh(wellGeo, mat)
  well.position.y = -0.454
  group.add(well)

  return {
    group,
    innerRadius:  0.228,
    innerHeight:  0.770,  // interior from floor to rim lip
    vesselBottom: -0.372, // Y of interior floor
    isTransparent: false,
  }
}

// ── cup-hot-takeaway — kraft paper cup + sleeve + dark lid ────────────────────

function buildCupHotTakeaway(): ProceduralVesselResult {
  const group = new THREE.Group()

  // Kraft cup body
  const cupProfile: Pt[] = [
    { r: 0.000, y: -0.450 },
    { r: 0.195, y: -0.450 },
    { r: 0.205, y: -0.425 },
    { r: 0.218, y: -0.310 },
    { r: 0.238, y: -0.080 },
    { r: 0.258, y:  0.170 },
    { r: 0.278, y:  0.395 },
    { r: 0.290, y:  0.425 },
    { r: 0.286, y:  0.430 }, // rim fold
  ]
  group.add(mesh(lathe(cupProfile, 56), kraftMat()))

  // Corrugated sleeve (sits around mid-section)
  const sleeveGeo = new THREE.CylinderGeometry(0.296, 0.256, 0.340, 48)
  const s = mesh(sleeveGeo, sleeveMat())
  s.position.y = -0.020
  group.add(s)

  // Lid ring
  const lidRingGeo = new THREE.CylinderGeometry(0.298, 0.285, 0.060, 48)
  const lidRing = mesh(lidRingGeo, darkLidMat())
  lidRing.position.y = 0.455
  group.add(lidRing)

  // Lid cap (flat top with slight dome)
  const lidCapGeo = new THREE.CylinderGeometry(0.282, 0.282, 0.016, 40)
  const lidCap = mesh(lidCapGeo, darkLidMat())
  lidCap.position.y = 0.494
  group.add(lidCap)

  // Sip-hole bump
  const bumpGeo = new THREE.SphereGeometry(0.042, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.38)
  const bump = mesh(bumpGeo, darkLidMat())
  bump.position.set(0.08, 0.500, 0)
  group.add(bump)

  return {
    group,
    innerRadius:  0.248,
    innerHeight:  0.840,
    vesselBottom: -0.425,
    isTransparent: false,
  }
}

// ── glass-iced-dinein — tall clear glass, double-wall feel ────────────────────

function buildGlassIcedDinein(): ProceduralVesselResult {
  const group = new THREE.Group()
  const mat = glassMat()

  // Outer wall — tall cylinder, very slight taper wider at top
  const outerProfile: Pt[] = [
    { r: 0.000, y: -0.660 }, // center base
    { r: 0.230, y: -0.660 }, // base outer
    { r: 0.238, y: -0.636 }, // base bevel
    { r: 0.244, y: -0.500 }, // lower wall
    { r: 0.248, y:  0.000 }, // mid wall
    { r: 0.252, y:  0.500 }, // upper wall
    { r: 0.258, y:  0.638 }, // near rim
    { r: 0.265, y:  0.660 }, // rim top
  ]
  group.add(mesh(lathe(outerProfile, 64), mat))

  // Inner wall (creates double-wall glass look — slightly inside outer)
  const innerProfile: Pt[] = [
    { r: 0.000, y: -0.640 },
    { r: 0.212, y: -0.640 },
    { r: 0.220, y: -0.620 },
    { r: 0.224, y: -0.480 },
    { r: 0.228, y:  0.000 },
    { r: 0.232, y:  0.480 },
    { r: 0.236, y:  0.640 },
  ]
  group.add(mesh(lathe(innerProfile, 56), mat))

  return {
    group,
    innerRadius:  0.220,
    innerHeight:  1.290, // bottom at -0.640, rim inner at 0.650
    vesselBottom: -0.630,
    isTransparent: true,
  }
}

// ── cup-iced-takeaway — clear plastic cup + dome lid ─────────────────────────

function buildCupIcedTakeaway(): ProceduralVesselResult {
  const group = new THREE.Group()
  const mat = plasticMat()

  // Clear cup body
  const cupProfile: Pt[] = [
    { r: 0.000, y: -0.500 },
    { r: 0.210, y: -0.500 },
    { r: 0.220, y: -0.475 },
    { r: 0.232, y: -0.340 },
    { r: 0.250, y: -0.060 },
    { r: 0.268, y:  0.220 },
    { r: 0.282, y:  0.470 },
    { r: 0.292, y:  0.502 },
  ]
  group.add(mesh(lathe(cupProfile, 56), mat))

  // Dome lid ring
  const lidRingGeo = new THREE.CylinderGeometry(0.302, 0.290, 0.048, 48)
  const lidRing = mesh(lidRingGeo, mat)
  lidRing.position.y = 0.526
  group.add(lidRing)

  // Dome cap (lathe profile going inward to center)
  const domePts: Pt[] = [
    { r: 0.000, y: 0.608 }, // tip / center top
    { r: 0.060, y: 0.606 },
    { r: 0.130, y: 0.598 },
    { r: 0.200, y: 0.578 },
    { r: 0.260, y: 0.555 },
    { r: 0.298, y: 0.550 },
    { r: 0.302, y: 0.548 },
  ]
  group.add(mesh(lathe(domePts, 48), mat))

  return {
    group,
    innerRadius:  0.248,
    innerHeight:  0.970,
    vesselBottom: -0.475,
    isTransparent: true,
  }
}

// ── smoothie — wide clear cup + dome lid + pink straw ────────────────────────

function buildSmoothie(): ProceduralVesselResult {
  const group = new THREE.Group()
  const mat = plasticMat()

  // Wide clear cup (wider than iced cup)
  const cupProfile: Pt[] = [
    { r: 0.000, y: -0.580 },
    { r: 0.245, y: -0.580 },
    { r: 0.258, y: -0.555 },
    { r: 0.272, y: -0.390 },
    { r: 0.292, y: -0.080 },
    { r: 0.308, y:  0.240 },
    { r: 0.320, y:  0.520 },
    { r: 0.328, y:  0.555 },
  ]
  group.add(mesh(lathe(cupProfile, 60), mat))

  // Dome lid ring
  const lidRingGeo = new THREE.CylinderGeometry(0.338, 0.326, 0.050, 52)
  const lidRing = mesh(lidRingGeo, mat)
  lidRing.position.y = 0.580
  group.add(lidRing)

  // Dome cap
  const domePts: Pt[] = [
    { r: 0.000, y: 0.672 },
    { r: 0.060, y: 0.670 },
    { r: 0.140, y: 0.660 },
    { r: 0.220, y: 0.638 },
    { r: 0.298, y: 0.608 },
    { r: 0.335, y: 0.600 },
    { r: 0.338, y: 0.598 },
  ]
  group.add(mesh(lathe(domePts, 52), mat))

  // Straw — thin pink cylinder rising from dome
  const strawGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.88, 8)
  const strawMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1.0, 0.40, 0.62),
    roughness: 0.45,
    metalness: 0.0,
  })
  const straw = mesh(strawGeo, strawMat)
  // Bottom of straw at y=0.44 (inside cup), extends to y=1.32 (above dome by ~0.65)
  straw.position.set(0.075, 0.44 + 0.88 / 2, 0)
  group.add(straw)

  return {
    group,
    innerRadius:  0.288,
    innerHeight:  1.110,
    vesselBottom: -0.555,
    isTransparent: true,
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function buildProceduralVessel(key: VesselKey): ProceduralVesselResult {
  switch (key) {
    case 'cup-hot-dinein':    return buildCupHotDinein()
    case 'cup-hot-takeaway':  return buildCupHotTakeaway()
    case 'glass-iced-dinein': return buildGlassIcedDinein()
    case 'cup-iced-takeaway': return buildCupIcedTakeaway()
    case 'smoothie':          return buildSmoothie()
    default:                  return buildCupHotDinein()
  }
}